/**
 * Comportamiento del campo Monto (rate) de las lineas de la factura.
 *
 * En facturas de seguro el Monto se derivaba SIEMPRE de price_list_rate, asi que
 * teclearlo a mano no movia Autorizado/Diferencia y apply_copago_discount
 * devolvia el rate a su valor derivado. Caso real: FACT-170927, linea SONOGRAFIA
 * ABDOMINAL con price_list_rate 856, rate 642 y autorizado 770.40 + diferencia
 * 85.60 = 856, o sea reclamandole al seguro mas que el total de la linea.
 *
 * Ejecutar: node --test apps/rades/tests/js/
 */

const test = require("node:test");
const assert = require("node:assert");
const { load_sales_invoice_script } = require("./harness");

const SEGURO = {
	tipo_de_factura: "Clientes Seguros",
	customer: "BERENICE SEVERINO SANTANA",
	ars: "ARS YUNEN",
	cobertura: 90,
};

function linea(overrides) {
	return Object.assign(
		{
			item_code: "SONOGRAFIA ABDOMINAL",
			item_name: "SONOGRAFIA ABDOMINAL",
			price_list_rate: 856,
			rate: 856,
			cobertura: 90,
			copago: 0,
			authorized_amount: 770.4,
			claimed_amount: 856,
			difference_amount: 85.6,
		},
		overrides
	);
}

test("seguro: el Monto tecleado se conserva", async () => {
	const { make_form, user_types } = load_sales_invoice_script();
	const frm = make_form(SEGURO, [linea()]);
	const row = frm.doc.items[0];

	await user_types(frm, row, "rate", 800.02);

	assert.strictEqual(row.rate, 800.02, "el Monto tecleado no debe revertirse");
});

test("seguro: Autorizado y Diferencia siguen al Monto tecleado", async () => {
	const { make_form, user_types } = load_sales_invoice_script();
	const frm = make_form(SEGURO, [linea()]);
	const row = frm.doc.items[0];

	await user_types(frm, row, "rate", 800.02);

	assert.strictEqual(row.authorized_amount, 720.02, "Autorizado = Monto x cobertura");
	assert.strictEqual(row.difference_amount, 80.0, "Diferencia = Monto - Autorizado");
	assert.strictEqual(row.claimed_amount, 800.02, "Reclamado = Monto");
});

test("seguro: Autorizado + Diferencia + copago cuadran con el Monto", async () => {
	const { make_form, user_types } = load_sales_invoice_script();
	const frm = make_form(SEGURO, [linea()]);
	const row = frm.doc.items[0];

	await user_types(frm, row, "rate", 800.02);

	const suma = row.authorized_amount + row.difference_amount + row.copago;
	assert.strictEqual(
		Math.round(suma * 100) / 100,
		row.rate,
		"la factura no puede reclamarle al seguro mas de lo que cobra (FACT-170927)"
	);
});

test("seguro: los totales de cabecera siguen al Monto tecleado", async () => {
	const { make_form, user_types } = load_sales_invoice_script();
	const frm = make_form(SEGURO, [linea()]);
	const row = frm.doc.items[0];

	await user_types(frm, row, "rate", 800.02);

	assert.strictEqual(frm.doc.monto_autorizado, 720.02);
	assert.strictEqual(frm.doc.diferencia, 80.0);
	assert.strictEqual(frm.doc.monto_reclamado, 800.02);
});

test("seguro: dos ediciones seguidas dejan el ultimo Monto, no el anterior", async () => {
	const { make_form, user_types } = load_sales_invoice_script();
	const frm = make_form(SEGURO, [linea()]);
	const row = frm.doc.items[0];

	await user_types(frm, row, "rate", 800.02);
	await user_types(frm, row, "rate", 700.0);

	assert.strictEqual(row.rate, 700.0, "no debe volver al Monto de la edicion anterior");
	assert.strictEqual(row.authorized_amount, 630.0);
	assert.strictEqual(row.difference_amount, 70.0);
});

test("seguro: el copago sigue descontandose del Monto (sin regresion)", async () => {
	const { make_form, user_types } = load_sales_invoice_script();
	const frm = make_form(SEGURO, [linea()]);
	const row = frm.doc.items[0];

	await user_types(frm, row, "copago", 50);

	assert.strictEqual(row.authorized_amount, 770.4, "Autorizado sale de la tarifa, no del copago");
	assert.strictEqual(row.difference_amount, 35.6, "Diferencia = tarifa - autorizado - copago");
	assert.strictEqual(row.rate, 806.0, "el copago se traslada al Monto como descuento");
});

test("seguro: tras teclear el Monto, el copago se aplica sobre el nuevo Monto", async () => {
	const { make_form, user_types } = load_sales_invoice_script();
	const frm = make_form(SEGURO, [linea()]);
	const row = frm.doc.items[0];

	await user_types(frm, row, "rate", 800.0);
	await user_types(frm, row, "copago", 50);

	assert.strictEqual(row.authorized_amount, 720.0, "Autorizado = 800 x 90%");
	assert.strictEqual(row.difference_amount, 30.0, "Diferencia = 800 - 720 - 50");
	assert.strictEqual(row.rate, 750.0, "Monto cobrado = 800 - copago 50");
});

test("seguro: una linea ya guardada descuadrada se corrige al reteclear el Monto", async () => {
	// Estado real de FACT-170927 linea 2 (SONOGRAFIA ABDOMINAL): el Monto quedo
	// en 642 pero autorizado/diferencia siguen en la tarifa de 856. Al abrir la
	// factura __referral_pct no existe y discount_percentage trae el 25% que
	// ERPNext derivo de aquella edicion manual.
	const { make_form, user_types } = load_sales_invoice_script();
	const frm = make_form(SEGURO, [
		linea({ rate: 642, discount_percentage: 25, discount_amount: 214 }),
	]);
	const row = frm.doc.items[0];

	await user_types(frm, row, "rate", 800.02);

	assert.strictEqual(row.rate, 800.02);
	assert.strictEqual(row.authorized_amount, 720.02);
	assert.strictEqual(row.difference_amount, 80.0);
});

test("no seguro: teclear el Monto sigue moviendo la Diferencia", async () => {
	const { make_form, user_types } = load_sales_invoice_script();
	const frm = make_form(
		{ tipo_de_factura: "Alquiler", customer: "ALQUILER", cobertura: 0 },
		[
			linea({
				item_code: "ALQUILER",
				item_name: "ALQUILER",
				cobertura: 0,
				authorized_amount: 0,
				difference_amount: 856,
			}),
		]
	);
	const row = frm.doc.items[0];

	await user_types(frm, row, "rate", 800.02);

	assert.strictEqual(row.rate, 800.02);
	assert.strictEqual(row.authorized_amount, 0, "fuera de seguros el autorizado siempre es 0");
	assert.strictEqual(row.difference_amount, 800.02, "todo va a la diferencia");
	assert.strictEqual(row.claimed_amount, 800.02);
});

test("seguro: cambiar la cobertura recalcula desde el Monto vigente", async () => {
	const { make_form, user_types } = load_sales_invoice_script();
	const frm = make_form(SEGURO, [linea()]);
	const row = frm.doc.items[0];

	await user_types(frm, row, "rate", 800.0);
	await user_types(frm, row, "cobertura", 80);

	assert.strictEqual(row.rate, 800.0, "cambiar la cobertura no debe mover el Monto");
	assert.strictEqual(row.authorized_amount, 640.0);
	assert.strictEqual(row.difference_amount, 160.0);
});
