const puppeteer = require('puppeteer');
const kvZusatzbeitrag = 1.1
const startBruttoArbeitnehmer = 5000
const endBruttoArbeitnehmer = 200000
const step = 1000


async function getAbgabenlast(page, bruttoArbeitnehmer) {
    let res = new Object()
    const navigationPromise = page.waitForNavigation()

    await page.goto('https://www.nettolohn.de/')

    await page.setViewport({ width: 1064, height: 787 })

    await navigationPromise
    // Bruttolohn eingeben
    await page.waitForSelector('#rechner > #form_salary_brutto #salary_data_salary_brutto')
    await page.$eval('#rechner > #form_salary_brutto #salary_data_salary_brutto', (el, bruttoArbeitnehmer) => {
        el.value = bruttoArbeitnehmer
    }, bruttoArbeitnehmer)

    // jährlich
    await page.waitForSelector('.extended_form > #form_period > .col-xs-6 > .radio:nth-child(2) > label')
    await page.click('.extended_form > #form_period > .col-xs-6 > .radio:nth-child(2) > label')

    // keine Kirchensteuer
    await page.waitForSelector('#rechner > #form_is_church > .col-xs-6 > .radio:nth-child(2) > label')
    await page.click('#rechner > #form_is_church > .col-xs-6 > .radio:nth-child(2) > label')

    // Bundesland
    await page.waitForSelector('.col-sm-12 > #rechner > #form_state_id #salary_data_state_id')
    await page.click('.col-sm-12 > #rechner > #form_state_id #salary_data_state_id')
    await page.select('.col-sm-12 > #rechner > #form_state_id #salary_data_state_id', '7')
    await page.waitForSelector('.col-sm-12 > #rechner > #form_state_id #salary_data_state_id')
    await page.click('.col-sm-12 > #rechner > #form_state_id #salary_data_state_id')

    // Krankenversicherung Zusatzbeitrag eingeben
    await page.waitForSelector('.extended_form > #form_kv_satz #salary_data_kv_zuschlag')
    await page.$eval('.extended_form > #form_kv_satz #salary_data_kv_zuschlag', (el, kvZusatzbeitrag) => {
        el.value = kvZusatzbeitrag
    }, kvZusatzbeitrag)

    // Berechnung starten
    await page.waitForSelector('.col-sm-12 > #rechner > #rechnen #berechnung')
    await page.click('.col-sm-12 > #rechner > #rechnen #berechnung')

    // Brutto AG
    await page.waitForSelector('#primary > table.table.table-condesed > tbody > tr:nth-child(7) > td.text-right.view-year')
    res.bruttoArbeitgeber = parseFloat(await page.$eval('#primary > table.table.table-condesed > tbody > tr:nth-child(7) > td.text-right.view-year', el => el.innerText.slice(0, -2).replace('.', '').replace(',', '.')))

    // Netto AN
    await page.waitForSelector('#primary > table:nth-child(7) > tbody > tr.hidden-xs.bg-info > td.b.text-right.view-year')
    res.nettoArbeitnehmer = parseFloat(await page.$eval('#primary > table:nth-child(7) > tbody > tr.hidden-xs.bg-info > td.b.text-right.view-year', el => el.innerText.slice(0, -2).replace('.', '').replace(',', '.')))

    // Abgabenlast AG
    res.abgabenlastArbeitgeber = (res.nettoArbeitnehmer / res.bruttoArbeitgeber - 1) * (-100)

    // Abgabenlast AN
    res.abgabenlastArbeitnehmer = (res.nettoArbeitnehmer / bruttoArbeitnehmer - 1) * (-100)

    // Anteil Steuern AG
    await page.waitForSelector('#primary > table:nth-child(7) > tbody > tr:nth-child(5) > td.b.text-right.view-year')
    res.anteilSteuernArbeitgeber = (await page.$eval('#primary > table:nth-child(7) > tbody > tr:nth-child(5) > td.b.text-right.view-year', el => el.innerText.slice(0, -2).replace('.', '').replace(',', '.')) / res.bruttoArbeitgeber) * 100

    // Anteil Sozialabgaben AG
    const childId = bruttoArbeitnehmer <= 5400 ? 11 : 12
    await page.waitForSelector(`#primary > table:nth-child(4) > tbody > tr:nth-child(${childId}) > td.b.text-right.view-year`)
    res.anteilSozialabgabenArbeitgeber = (parseFloat(await page.$eval(`#primary > table:nth-child(4) > tbody > tr:nth-child(${childId}) > td.b.text-right.view-year`, el => el.innerText.slice(0, -2).replace('.', '').replace(',', '.'))) + (res.bruttoArbeitgeber - bruttoArbeitnehmer)) / bruttoArbeitnehmer * 100

    await navigationPromise

    return res
}

async function main() {
    const browser = await puppeteer.launch({
        headless: false
    })
    const page = await browser.newPage()
    page.setDefaultTimeout(45000)

    for (let bruttoArbeitnehmer = startBruttoArbeitnehmer; bruttoArbeitnehmer < endBruttoArbeitnehmer; bruttoArbeitnehmer += step) {
        let abgabenlastRes = await getAbgabenlast(page, bruttoArbeitnehmer)

        // ugly output but I'm going to pipe it to a file so I can copy it to excel
        console.log(abgabenlastRes.bruttoArbeitgeber); // Brutto AG (Die gesamten Lohnkosten die der AG traegt)
        console.log(bruttoArbeitnehmer); // Brutto AN
        console.log(abgabenlastRes.nettoArbeitnehmer); // Netto AN
        console.log(abgabenlastRes.abgabenlastArbeitgeber); // Abgabenlast AG (Die gesamten Abgaben/Steuern im Verhaeltnis zum Nettolohn des AN)
        console.log(abgabenlastRes.abgabenlastArbeitnehmer); // Abgabenlast AN (Die vom AN geleisteten Abgaben/Steuern im Verhaeltnis zum Nettolohn des AN)
        console.log(abgabenlastRes.anteilSteuernArbeitgeber); // Anteil Steuern AG (Die Steuern im Verhaeltnis zu den Lohnkosten)
        console.log(abgabenlastRes.anteilSozialabgabenArbeitgeber + "\n"); // Anteil Sozialabgaben AG (Die gesamten Sozialabgaben im Verhaeltnis zu den Lohnkosten)
    }

    await browser.close()
}

main()