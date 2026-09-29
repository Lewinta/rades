// Client Script "Sales Invoice-Client". Vive en la base de datos, no en el app;
// esta copia existe para poder versionarlo. Para desplegarlo hay que escribirlo
// en el doctype Client Script (frappe.db.set_value) — un bench migrate no lo sube.
//
// Nació como copia del JS de rades y con el tiempo quedó desfasado. Frappe
// ejecuta los handlers del Client Script ADEMÁS de los del app para el mismo
// evento, así que sus versiones viejas de item_table_update y
// refresh_outside_amounts peleaban contra rades/public/js/sales_invoice.js:
// recalculaban los montos en positivo desde el rate y reescribían la tabla de
// pagos. Ambos se eliminaron — el cálculo lo hace el app, que además respeta el
// signo de las devoluciones.
//
// Aquí solo queda lo que el app NO hace:
//   - validate: aviso cuando lo recibido no cuadra con lo facturado
//   - ars: cobertura 45 para ARS UNIVERSAL / ARS RESERVAS
//   - posting_date / tipo_de_factura: armado inicial de la tabla de pagos POS
//
// La versión anterior está en sales_invoice_client.previous.js.

function get_today(frm){
	let year = frm.doc.posting_date.split("-")[0]
	let month = eval(frm.doc.posting_date.split("-")[1]) - 1
	let day = frm.doc.posting_date.split("-")[2]
	let weekday = new Date(year, month, day).toString().split(" ")[0]
	return weekday
}

function es_jueves(frm) {
	return get_today(frm) == "Thu" ? true : false;
}

// La tabla de pagos solo se arma cuando está vacía de montos.
//
// En una nota de crédito los pagos son el desglose de la factura original en
// negativo (lo garantiza rades.sales_invoice._restore_return_payments en el
// servidor); rearmarlos los borra. Eso era lo que pasaba al cambiar la fecha de
// contabilización: los montos se ponían en 0 y aparecían medios de pago que la
// factura nunca tuvo. Y en cualquier factura con montos ya tecleados, rearmar
// la tabla perdería lo escrito.
function puede_armar_pagos(frm) {
	if (frm.doc.is_return) {
		return false;
	}
	return !(frm.doc.payments || []).some((pago) => flt(pago.amount));
}

function armar_pagos_de_seguro(frm) {
	frm.add_child("payments", {"mode_of_payment": "Seguro"});
	frm.add_child("payments", {"mode_of_payment": "Efectivo"});

	if (es_jueves(frm)) {
		frm.add_child("payments", {"mode_of_payment": "Co-Pago"});
	}
}

frappe.ui.form.on("Sales Invoice", {
	"validate": frm => {
	const no_verif = ["Clientes Privados", "Clientes Seguros"];
	if (frm.doc.paid_amount != frm.doc.grand_total && no_verif.includes(frm.doc.tipo_de_factura) && cur_frm.doc.is_pos){
			frappe.msgprint("Favor verificar que el monto recibido $"+ frm.doc.paid_amount +" sea igual al facturado $"+ frm.doc.grand_total)
			validated = false;
		}
	},

	"ars": (frm) => {
		// selling_price_list lo maneja update_selling_price_list_from_ars en el
		// app, que además lo bloquea en devoluciones: cambiar la lista de precios
		// re-cotiza las líneas y el rate acaba por encima del de la factura.
		if (["ARS UNIVERSAL", "ARS RESERVAS"].includes(frm.doc.ars)) {
			frm.set_value("cobertura", 45);
		}
	},

    "posting_date": (frm) => {
    	if (!puede_armar_pagos(frm)) {
    		return;
    	}

    	frm.clear_table("payments");
    	armar_pagos_de_seguro(frm);
		refresh_field("payments");
    },

	"tipo_de_factura": (frm) => {
		// En una nota de crédito el tipo viene de la factura original: limpiar
		// customer/nss/ars y rearmar los pagos la dejaría inservible.
		if (frm.doc.is_return) {
			return;
		}

		$.map(["customer", "nss", "ars", "tax_id"], (field) => {
			frm.set_value(field, undefined);
		});

		frm.clear_table("payments")
		frm.set_value("referido", 0)

		if (frm.doc.tipo_de_factura == "Clientes Seguros") {
			if (frm.is_new()) {
				frm.set_value("cobertura", frappe.boot.conf.autorizado_por_seguros);
				armar_pagos_de_seguro(frm);
			}
		} else if (frm.doc.tipo_de_factura == "Meds") {
			let fields_dict = {
				"cobertura": 100,
				"ars": frm.doc.tipo_de_factura,
				"nss": null
			};

			$.each(fields_dict, (field, value) => {
				frm.set_value(field, value);
			});

			frm.add_child("payments", {
				"mode_of_payment": "Meds"
			});
		} else if (frm.doc.tipo_de_factura == "Servimerd") {
			let fields_dict = {
				"cobertura": frappe.boot.conf.autorizado_por_seguros,
			};

			$.each(fields_dict, (field, value) => {
				frm.set_value(field, value);
			});

			frm.add_child("payments", {
				"mode_of_payment": "Servimerd"
			});

		} else {
			frm.is_new() && frm.set_value("cobertura", undefined);
			frm.add_child("payments",{"mode_of_payment":"Efectivo"})
		}
		refresh_field("payments");

		frm.set_value("naming_series", frm.doc.tipo_de_factura == "Proveedores" || frm.doc.tipo_de_factura == "Alquiler" ? "B01.########" : "B02.########");
	}
});
