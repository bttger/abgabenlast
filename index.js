const puppeteer = require('puppeteer');
const xlsx = require('xlsx')
const kvZusatzbeitrag = 1.1
const startBruttoArbeitnehmer = 5000
const endBruttoArbeitnehmer = 100000
const step = 1000
const sozialabgabenSchwelle = 5400
const privateKvSchwelle = 62550
const plz = 20095


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

    // jaehrlich
    await page.waitForSelector('.extended_form > #form_period > .col-xs-6 > .radio:nth-child(2) > label')
    await page.click('.extended_form > #form_period > .col-xs-6 > .radio:nth-child(2) > label')

    // keine Kirchensteuer
    await page.waitForSelector('#rechner > #form_is_church > .col-xs-6 > .radio:nth-child(2) > label')
    await page.click('#rechner > #form_is_church > .col-xs-6 > .radio:nth-child(2) > label')

    // Bundesland oder Postleitzahl
    try {
        await page.waitForSelector('.col-sm-12 > #rechner > #form_state_id #salary_data_state_id', { timeout: 100 })
        await page.click('.col-sm-12 > #rechner > #form_state_id #salary_data_state_id')
        await page.select('.col-sm-12 > #rechner > #form_state_id #salary_data_state_id', '7')
        await page.waitForSelector('.col-sm-12 > #rechner > #form_state_id #salary_data_state_id')
        await page.click('.col-sm-12 > #rechner > #form_state_id #salary_data_state_id')
    } catch (e) {
        await page.waitForSelector('#autocomplete_salary_data_geodb_loc_id')
        await page.$eval('#autocomplete_salary_data_geodb_loc_id', (el, plz) => {
            el.value = plz
        }, plz)
    }

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
    const childIdPrivateKv = bruttoArbeitnehmer >= privateKvSchwelle ? 6 : 7
    await page.waitForSelector(`#primary > table:nth-child(${childIdPrivateKv}) > tbody > tr.hidden-xs.bg-info > td.b.text-right.view-year`)
    res.nettoArbeitnehmer = parseFloat(await page.$eval(`#primary > table:nth-child(${childIdPrivateKv}) > tbody > tr.hidden-xs.bg-info > td.b.text-right.view-year`, el => el.innerText.slice(0, -2).replace('.', '').replace(',', '.')))

    // Abgabenlast AG
    res.abgabenlastArbeitgeber = (res.nettoArbeitnehmer / res.bruttoArbeitgeber - 1) * (-100)

    // Abgabenlast AN
    res.abgabenlastArbeitnehmer = (res.nettoArbeitnehmer / bruttoArbeitnehmer - 1) * (-100)

    // Anteil Steuern AG
    await page.waitForSelector(`#primary > table:nth-child(${childIdPrivateKv}) > tbody > tr:nth-child(5) > td.b.text-right.view-year`)
    res.anteilSteuernArbeitgeber = (await page.$eval(`#primary > table:nth-child(${childIdPrivateKv}) > tbody > tr:nth-child(5) > td.b.text-right.view-year`, el => el.innerText.slice(0, -2).replace('.', '').replace(',', '.')) / res.bruttoArbeitgeber) * 100

    // Anteil Sozialabgaben AG
    const childIdSozialabgaben = bruttoArbeitnehmer <= sozialabgabenSchwelle ? 11 : 12
    await page.waitForSelector(`#primary > table:nth-child(4) > tbody > tr:nth-child(${childIdSozialabgaben}) > td.b.text-right.view-year`)
    res.anteilSozialabgabenArbeitgeber = (parseFloat(await page.$eval(`#primary > table:nth-child(4) > tbody > tr:nth-child(${childIdSozialabgaben}) > td.b.text-right.view-year`, el => el.innerText.slice(0, -2).replace('.', '').replace(',', '.'))) + (res.bruttoArbeitgeber - bruttoArbeitnehmer)) / bruttoArbeitnehmer * 100

    await navigationPromise

    return res
}

async function main() {
    const browser = await puppeteer.launch({
        headless: false
    })
    const page = await browser.newPage()
    page.setDefaultTimeout(45000)

    // init result array
    let ws_data = [
        ["Lohnkosten"],
        ["Brutto AN"],
        ["Netto AN"],
        ["Gesamtabgabenlast an Netto"],
        ["Abgabenlast AN"],
        ["Anteil Steuern an Lohnkosten"],
        ["Anteil Sozialabgaben an Lohnkosten"]
    ]

    for (let bruttoArbeitnehmer = startBruttoArbeitnehmer; bruttoArbeitnehmer < endBruttoArbeitnehmer; bruttoArbeitnehmer += step) {
        let abgabenlastRes = await getAbgabenlast(page, bruttoArbeitnehmer)

        console.log(abgabenlastRes.bruttoArbeitgeber); // Brutto AG (Die gesamten Lohnkosten die der AG traegt)
        console.log(bruttoArbeitnehmer); // Brutto AN
        console.log(abgabenlastRes.nettoArbeitnehmer); // Netto AN
        console.log(abgabenlastRes.abgabenlastArbeitgeber); // Abgabenlast AG (Die gesamten Abgaben/Steuern im Verhaeltnis zum Nettolohn des AN)
        console.log(abgabenlastRes.abgabenlastArbeitnehmer); // Abgabenlast AN (Die vom AN geleisteten Abgaben/Steuern im Verhaeltnis zum Nettolohn des AN)
        console.log(abgabenlastRes.anteilSteuernArbeitgeber); // Anteil Steuern AG (Die Steuern im Verhaeltnis zu den Lohnkosten)
        console.log(abgabenlastRes.anteilSozialabgabenArbeitgeber + "\n"); // Anteil Sozialabgaben AG (Die gesamten Sozialabgaben im Verhaeltnis zu den Lohnkosten)

        ws_data[0].push(abgabenlastRes.bruttoArbeitgeber)
        ws_data[1].push(bruttoArbeitnehmer)
        ws_data[2].push(abgabenlastRes.nettoArbeitnehmer)
        ws_data[3].push(abgabenlastRes.abgabenlastArbeitgeber)
        ws_data[4].push(abgabenlastRes.abgabenlastArbeitnehmer)
        ws_data[5].push(abgabenlastRes.anteilSteuernArbeitgeber)
        ws_data[6].push(abgabenlastRes.anteilSozialabgabenArbeitgeber)
    }

    await browser.close()

    // init excel workbook/sheet and write results to the xlsx file
    let wb = xlsx.utils.book_new();
    const ws_name = "abgabenlast";
    var ws = xlsx.utils.aoa_to_sheet(ws_data);
    xlsx.utils.book_append_sheet(wb, ws, ws_name);
    xlsx.writeFile(wb, 'out.xlsx');
}

main()