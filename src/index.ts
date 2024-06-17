import axios from 'axios';
import * as fs from 'fs';
import csv = require('csv-parser');
import { createObjectCsvWriter } from 'csv-writer';

interface FinancialReport {
    announcementDateTime: string;
    marketCategory: string;
    companyCode: string;
    companyName: string;
    announcementItem: string;
    announcementTitle: string;
    year: number;
    period: string;
}

const TARGET_DATE = new Date('2015-01-01'); // 设定最早抓取日期为104/01/01

async function fetchReports(sDate: string, eDate: string): Promise<any> {
    const url = 'https://mops.twse.com.tw/mops/web/ezsearch_query';

    const params = new URLSearchParams();
    params.append('step', '00');
    params.append('RADIO_CM', '1');
    params.append('TYPEK', 'sii');
    params.append('CO_MARKET', '');
    params.append('CO_ID', '');
    params.append('PRO_ITEM', 'E02'); // 公告项目
    params.append('SUBJECT', '');
    params.append('SDATE', sDate); // 设置开始日期
    params.append('EDATE', eDate); // 设置结束日期
    params.append('lang', 'TW');
    params.append('AN', '');
    params.append('page', '1'); // 只获取第一页的数据

    const headers = {
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Connection': 'keep-alive',
        'Content-Length': params.toString().length.toString(),
        'Content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'Cookie': 'jcsession=jHttpSession@5d19e72b; _ga=GA1.3.592467458.1718357962; _gid=GA1.3.1010584219.1718357962; _ga_LTMT28749H=GS1.3.1718357961.1.0.1718357961.0.0.0',
        'Host': 'mops.twse.com.tw',
        'Origin': 'https://mops.twse.com.tw',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"'
    };

    const response = await axios.post(url, params, { headers });
    return response.data;  // 返回 JSON 数据
}

function parseFinancialReports(data: any[]): FinancialReport[] {
    const reports: FinancialReport[] = [];
    data.forEach((item: any) => {
        const { CDATE, COMPANY_NAME, AN_NAME, CODE_NAME, AN_CODE, CTIME, TYPEK, SUBJECT, HYPERLINK, COMPANY_ID } = item;
        const { year, period } = parseSubject(SUBJECT);
        const report: FinancialReport = {
            announcementDateTime: CDATE + ' ' + CTIME,
            marketCategory: TYPEK,
            companyCode: COMPANY_ID,
            companyName: COMPANY_NAME,
            announcementItem: AN_NAME,
            announcementTitle: SUBJECT,
            year,
            period
        };
        reports.push(report);
    });
    return reports;
}


function parseSubject(subject: string): { year: number, period: string } {
    const match = subject.match(/(\d{3})年第(\d)季/);
    if (match) {
        const year = 1911 + parseInt(match[1], 10); // 将民国年转换为公元年
        const period = `Q${match[2]}`;
        return { year, period };
    }
    return { year: 0, period: '' };
}

async function saveReportsToCSV(reports: FinancialReport[]) {
    const existingReports = await loadExistingReports();
    const filteredReports = reports.filter(report => !existingReports.has(report.announcementDateTime + report.companyCode));
    const csvWriter = createObjectCsvWriter({
        path: 'financial_reports.csv',
        header: [
            { id: 'announcementDateTime', title: 'Announcement DateTime' },
            { id: 'marketCategory', title: 'Market Category' },
            { id: 'companyCode', title: 'Company Code' },
            { id: 'companyName', title: 'Company Name' },
            { id: 'announcementItem', title: 'Announcement Item' },
            { id: 'announcementTitle', title: 'Announcement Title' },
            { id: 'year', title: 'Year' },
            { id: 'period', title: 'Period' }
        ],
        append: true
    });

    await csvWriter.writeRecords(filteredReports);
    console.log(`CSV file was written successfully with ${filteredReports.length} new records`);
}

async function loadExistingReports(): Promise<Set<string>> {
    return new Promise((resolve, reject) => {
        const existingReports = new Set<string>();
        if (fs.existsSync('financial_reports.csv')) {
            fs.createReadStream('financial_reports.csv')
                .pipe(csv())
                .on('data', (row: any) => {
                    existingReports.add(row['Announcement DateTime'] + row['Company Code']);
                })
                .on('end', () => {
                    resolve(existingReports);
                })
                .on('error', reject);
        } else {
            resolve(existingReports);
        }
    });
}

async function getOldestDate(): Promise<Date | null> {
    return new Promise((resolve, reject) => {
        let oldestDate: Date | null = null;
        if (fs.existsSync('financial_reports.csv')) {
            fs.createReadStream('financial_reports.csv')
                .pipe(csv())
                .on('data', (row: any) => {
                    // 分割日期和時間
                    const [dateStr, timeStr] = row['Announcement DateTime'].split(' ');
                    // 分割日期字串為年、月、日
                    const [minguoYear, month, day] = dateStr.split('/').map((val: string) => parseInt(val, 10));
                    // 將民國年轉換為西元年
                    const year = minguoYear + 1911;
                    // 建立日期物件
                    const date = new Date(year, month - 1, day);
                    // 更新最舊日期
                    if (!oldestDate || date < oldestDate) {
                        oldestDate = date;
                    }
                })
                .on('end', () => {
                    // 結束時返回最舊日期
                    resolve(oldestDate);
                })
                .on('error', reject); // 錯誤處理
        } else {
            // 如果檔案不存在，返回 null
            resolve(null);
        }
    });
}

async function main() {
    try {
        let currentDate = new Date('2024-05-17');
        let endDate = new Date('2024-06-17');
        while (currentDate >= TARGET_DATE) {
            const sDate = `${currentDate.getFullYear() - 1911}/${String(currentDate.getMonth() + 1).padStart(2, '0')}/${String(currentDate.getDate()).padStart(2, '0')}`;
            const eDate = `${endDate.getFullYear() - 1911}/${String(endDate.getMonth() + 1).padStart(2, '0')}/${String(endDate.getDate()).padStart(2, '0')}`;
            const response = await fetchReports(sDate, eDate);
            if (response && response.data) {
                const reports = parseFinancialReports(response.data);
                console.log(`Fetched ${reports.length} reports from ${sDate} to ${eDate}`);
                await saveReportsToCSV(reports);
                endDate = await getOldestDate() || new Date();
                currentDate = new Date(endDate);
                currentDate.setMonth(currentDate.getMonth() - 1); // 將 startDate 設為 endDate 的一個月前
            } else {
                console.log('No data found');
                break;
            }
        }
    } catch (error) {
        console.error('Error fetching reports:', error);
    }
}

main();
