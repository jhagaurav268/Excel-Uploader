import { LightningElement, track, api } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { readAsBinaryString } from './readFile';
import SHEETJS_ZIP from '@salesforce/resourceUrl/sheetjs'
import insertLeads from '@salesforce/apex/LeadController.insertLeads';

export default class ExcelUpload extends LightningElement {

    title = 'Lead CSV Loader';
    @track excelData = [];
    @track excelDataKeys = [];
    @track excelHeaders = [];
    showData = false;
    excelDataMap;
    isLoading = false;
    showResponse = false;
    responseData;

    constructor() {
        super();

        loadScript(this, SHEETJS_ZIP + '/xlsx.full.min.js').then(() => {
            if (!window.XLSX) {
                throw new Error('Error loading SheetJS library (XLSX undefined)');
            }
        }).catch(error => {
            console.log(error);
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Excel Upload: Error loading SheetJS',
                    message: error.message,
                    variant: 'error'
                })
            );
        });
    }

    uploadFile(evt) {
        this.showData = true;
        let file;

        Promise.resolve(evt.target.files).then(files => {

            if (files.length !== 1) {
                throw new Error("Error accessing file -- " +
                    (files.length === 0 ?
                        'No file received' :
                        'Multiple files received'
                    ));
            }

            file = files[0];
            console.log(file);

            var xlsxPattern = /\.xlsx$/i;

            if (!xlsxPattern.test(file.name)) {
                const event = new ShowToastEvent({
                    title: 'Error',
                    message: 'Please Select Excel Sheet',
                    variant: 'error'
                });
                this.dispatchEvent(event);
            }

            if (!file.name.endsWith('.xlsx')) {
                throw new Error("Please select an Excel file.");
            }

            return readAsBinaryString(file);
        }).then(blob => {

            let workbook = window.XLSX.read(blob, { type: 'binary' });
            console.log('workbook ', workbook);

            if (!workbook || !workbook.Workbook) { throw new Error("Cannot read Excel File (incorrect file format?)"); }
            if (workbook.SheetNames.length < 1) { throw new Error("Excel file does not contain any sheets"); }

            let sheet = workbook.Sheets[workbook.SheetNames[0]];
            let data = [];
            let range = XLSX.utils.decode_range(sheet['!ref']);
            for (let row = range.s.r; row <= range.e.r; ++row) {
                let rowData = {};
                for (let col = range.s.c; col <= range.e.c; ++col) {
                    let cellAddress = { c: col, r: row };
                    let cellRef = XLSX.utils.encode_cell(cellAddress);
                    let cell = sheet[cellRef];

                    rowData[`Column${col + 1}`] = cell ? cell.v : null;
                }
                data.push(rowData);
            }
            this.excelHeaders = Object.values(data[0]);
            this.excelHeaders = this.excelHeaders.map(header => header.trim());
            console.log(JSON.stringify(this.excelHeaders));
            this.excelDataKeys = data.slice(1);
            this.excelData = data.slice(1).map(obj => Object.values(obj));

            this.excelDataMap = this.excelData.map(data =>
                data.reduce((obj, value, index) => {
                    obj[this.excelHeaders[index]] = value;
                    return obj;
                }, {})
            );

        }).catch(err => {
            console.log('error ', JSON.stringify(err));
        });
    }

    insertLeadRecord() {
        this.isLoading = true;
        insertLeads({ leadData: this.excelDataMap }).then(result => {
            this.isLoading = false;
            this.showResponse = true;
            const responseArray = result.split(';');
            console.log(JSON.stringify(responseArray));
            this.responseData = responseArray.map(result => result.trim());
        }).catch(error => {
            console.error('Error inserting leads', error);
        });
    }
}