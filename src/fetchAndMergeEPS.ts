import axios from 'axios';
import * as fs from 'fs';
import csv = require('csv-parser');
import { createObjectCsvWriter } from 'csv-writer';
import ProgressBar from 'progress';  // Import progress bar library


interface FinancialReport {
    announcementDateTime: string;
    marketCategory: string;
    companyCode: string;
    companyName: string;
    announcementItem: string;
    announcementTitle: string;
    year: number;
    period: string;
    eps?: number; // Add EPS property
}

interface EPSData {
    year: number;
    period: number;
    eps: number;
}

// Fetch EPS data from API
async function fetchEPSData(companyNumber: string): Promise<EPSData[]> {
    const url = `https://ltn-fin-api-aphphbhzcce9g0ed.a02.azurefd.net/api/v0/indicator/financial-statement/profit-per-share?number=${companyNumber}&from=2015-01-01`;
    const response = await axios.get(url);
    return response.data.data.map((item: any) => ({
        year: item.year,
        period: item.period,
        eps: parseFloat(item.data.EPS),
    }));
}

// Load existing financial reports from CSV
async function loadFinancialReports(): Promise<FinancialReport[]> {
    return new Promise((resolve, reject) => {
        const reports: FinancialReport[] = [];
        if (fs.existsSync('financial_reports.csv')) {
            // If CSV file exists, read the file
            fs.createReadStream('financial_reports.csv')
                .pipe(csv())
                .on('data', (row: any) => {
                    // Split date and time
                    const [dateStr, timeStr] = row['Announcement DateTime'].split(' ');
                    // Split date string into year, month, day
                    const [minguoYear, month, day] = dateStr.split('/').map((val: string) => parseInt(val, 10));
                    // Convert ROC year to AD year
                    const year = minguoYear + 1911;
                    // Create date object
                    const announcementDateTime = new Date(year, month - 1, day).toISOString();
                    // Add data to the report array
                    reports.push({
                        announcementDateTime,
                        marketCategory: row['Market Category'],
                        companyCode: row['Company Code'],
                        companyName: row['Company Name'],
                        announcementItem: row['Announcement Item'],
                        announcementTitle: row['Announcement Title'],
                        year: parseInt(row['Year'], 10),
                        period: row['Period'],
                    });
                })
                .on('end', () => {
                    // Parsing successful when reading is complete
                    resolve(reports);
                })
                .on('error', reject);
        } else {
            // Return empty array if file does not exist
            resolve(reports);
        }
    });
}

// Merge EPS data with financial reports
function mergeData(reports: FinancialReport[], epsDataMap: Map<string, EPSData[]>): FinancialReport[] {
    return reports.map(report => {
        // Get the corresponding EPS data for the company
        const epsData = epsDataMap.get(report.companyCode);
        if (epsData) {
            // Find matching `year` and `period` in the EPS data
            const matchedEPS = epsData.find(eps => eps.year === report.year && eps.period === parseInt(report.period.replace('Q', ''), 10));
            if (matchedEPS) {
                // Add the matching EPS data to the financial report record if found
                report.eps = matchedEPS.eps;
            }
        }
        return report;
    });
}

// Save merged data to CSV
async function saveMergedDataToCSV(data: FinancialReport[]) {
    const csvWriter = createObjectCsvWriter({
        path: 'merged_data.csv',
        header: [
            { id: 'announcementDateTime', title: 'Announcement DateTime' },
            { id: 'marketCategory', title: 'Market Category' },
            { id: 'companyCode', title: 'Company Code' },
            { id: 'companyName', title: 'Company Name' },
            { id: 'announcementItem', title: 'Announcement Item' },
            { id: 'announcementTitle', title: 'Announcement Title' },
            { id: 'year', title: 'Year' },
            { id: 'period', title: 'Period' },
            { id: 'eps', title: 'EPS' },
        ],
        append: false,
    });

    await csvWriter.writeRecords(data);
    console.log('Merged CSV file was written successfully');
}

// Main function to execute the process
async function main() {
    try {
        // Load existing financial reports
        const financialReports = await loadFinancialReports();
        // Get all unique company codes
        const uniqueCompanyCodes = [...new Set(financialReports.map(report => report.companyCode))];

        // Set up the progress bar
        const bar = new ProgressBar('Fetching EPS data [:bar] :current/:total :percent :etas', {
            total: uniqueCompanyCodes.length,
            width: 40,
        });

        const epsDataMap = new Map<string, EPSData[]>();
        for (const companyCode of uniqueCompanyCodes) {
            // Fetch EPS data for each company
            const epsData = await fetchEPSData(companyCode);
            epsDataMap.set(companyCode, epsData);
            // Update the progress bar
            bar.tick();
        }

        // Merge EPS data with financial reports
        const mergedData = mergeData(financialReports, epsDataMap);
        // Save the merged data to CSV
        await saveMergedDataToCSV(mergedData);
    } catch (error) {
        console.error('Error:', error);
    }
}

main();
