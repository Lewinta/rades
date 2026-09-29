/**
 * Autorizado/Diferencia al agregar una linea nueva en una factura de seguro.
 *
 * Con Selling Settings.use_legacy_js_reactivity = 0 (csrd), ERPNext resuelve el
 * item en el servidor (process_item_selection) y al volver sincroniza la linea
 * completa, con authorized_amount = 0 porque el servidor no sabe de coberturas.
 * rades calculaba el Autorizado tras un timeout fijo de 0.3 s: si la respuesta
 * tardaba mas, la sincronizacion pisaba el calculo. Caso real: FACT-95232, linea
 * Mamografia Bilateral a 1,320 con cobertura 90 y Autorizado 0.00.
 *
 * Ejecutar: node --test apps/rades/tests/js/sales_invoice.item_code.test.js
 */

const test = require("node:test");
const assert = require("node:assert");
const { load_sales_invoice_script } = require("./harness");

const SEGURO = {
	tipo_de_factura: "Clientes Seguros",
	customer: "KADIDJA J. RIVERA DELGADO",
	ars: "ARS SENASA CONTRIBUTIVO",
	cobertura: 90,
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test("seguro: la respuesta lenta del servidor no deja el Autorizado en 0", async () => {
	const { frappe, make_form, user_types } = load_sales_invoice_script();
	const frm = make_form(SEGURO, [
		// Linea recien agregada: solo trae la cobertura (items_add); el nombre y
		// los precios llegan con la respuesta de process_item_selection.
		{ item_code: "", item_name: "", price_list_rate: 0, rate: 0, cobertura: 90 },
	]);
	const row = frm.doc.items[0];

	// Llamada al servidor en vuelo hasta que se resuelva a mano.
	let server_done;
	const pending = new Promise((resolve) => (server_done = resolve));
	frappe.after_ajax = () => pending;

	await user_types(frm, row, "item_code", "Mamografia Bilateral");
	await settle();

	// Llega la respuesta: frappe.model.sync pisa la linea con los valores del
	// servidor, incluido authorized_amount = 0.
	Object.assign(row, {
		item_name: "Mamografia Bilateral",
		price_list_rate: 1320,
		rate: 1320,
		amount: 1320,
		authorized_amount: 0,
		claimed_amount: 0,
		difference_amount: 0,
	});
	server_done();
	await settle();

	assert.strictEqual(row.authorized_amount, 1188, "Autorizado = 1,320 x 90%");
	assert.strictEqual(row.difference_amount, 132, "Diferencia = 1,320 - 1,188");
	assert.strictEqual(row.claimed_amount, 1320, "Reclamado = precio de la ARS");
	assert.strictEqual(frm.doc.monto_autorizado, 1188, "el total del header sigue a la linea");
});
