// --- Helper functions inlined: after the Frappe upgrade, doctype_js bundles
// --- are module-scoped, so these (defined in rades/public/js/sales_invoice.js)
// --- are no longer global and were not visible to this Client Script.
function get_today(frm){
	let year = frm.doc.posting_date.split("-")[0]
	let month = eval(frm.doc.posting_date.split("-")[1]) - 1
	let day = frm.doc.posting_date.split("-")[2]
	let weekday = new Date(year, month, day).toString().split(" ")[0]
	return weekday
}

function has_clearance(row, frm){
	let aplicar_descuento = false;
	$.grep(frappe.boot.conf.ofertas_jueves, (oferta) => {
		return oferta.item == row.item_code && oferta.day == get_today(frm);
	}).map((oferta) => {
		if (oferta) aplicar_descuento = true;
	});
	return aplicar_descuento
}

function aplicar_porciento(row){
	if (row && row.item_name)
		return row.item_name.substring(0,10) != "Diferencia";
}

function aplicar_copago(row, frm){
	if (has_clearance(row, frm) && frm.doc.tipo_de_factura == "Clientes Seguros" && frm.doc.ars != "ARS UNIVERSAL")
		return true
	else
		return false
}

function es_jueves(frm) {
	return get_today(frm) == "Thu" ? true : false;
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
		frm.doc.ars && frm.set_value("selling_price_list", frm.doc.ars);
		if (["ARS UNIVERSAL", "ARS RESERVAS"].includes(frm.doc.ars)) {
			frm.set_value("cobertura", 45);
		}
	},
	"item_table_update": (frm, cdt, cdn) => {
		frappe.run_serially([
			() => row = frappe.get_doc(cdt, cdn),
			() => frappe.timeout(0.5),
			() => {if(row && row.item_code) return},
			() => porciento = aplicar_porciento(row),
			() => cobertura = flt(row.cobertura) / 100.000,
			() => row.authorized_amount = porciento ? row.rate * cobertura : 0,
			() => row.claimed_amount = porciento ? row.rate : 0 ,
			() => row.difference_amount = aplicar_copago(row, frm) ? 0 : row.rate - row.authorized_amount,
			() => row.copago = aplicar_copago(row, frm) ? row.rate - row.authorized_amount : 0,
			() => refresh_field("items"),
			() => frm.trigger("refresh_outside_amounts"),
		])

	},
    "posting_date": (frm) => {
    	frm.clear_table("payments");

    	frm.add_child("payments",{"mode_of_payment":"Seguro"})
		frm.add_child("payments",{"mode_of_payment":"Efectivo"})
				
		if (es_jueves(frm)) 
			frm.add_child("payments",{"mode_of_payment":"Co-Pago"});

		refresh_field("payments");
    },
	"tipo_de_factura": (frm) => {
		$.map(["customer", "nss", "ars", "tax_id"], (field) => {
			frm.set_value(field, undefined);
		});

		frm.clear_table("payments")
		frm.set_value("referido", 0)

		if (frm.doc.tipo_de_factura == "Clientes Seguros") {
			if (frm.is_new()) {
				frm.set_value("cobertura", frappe.boot.conf.autorizado_por_seguros);
				frm.add_child("payments", {
					"mode_of_payment": "Seguro"
				});

				frm.add_child("payments", {
					"mode_of_payment": "Efectivo"
				});
				
				if (es_jueves(frm)) {
					frm.add_child("payments", {
						"mode_of_payment": "Co-Pago"
					});
				}
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
				// "ars": frm.doc.tipo_de_factura,
				// "nss": null
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
	},
	"refresh_outside_amounts": (frm) => {
		let total_authorized_amount = 0.000;
		let total_claimed_amount = 0.000;
		let total_difference_amount = 0.000;
		let total_copago_amount = 0.000;

		$.map(frm.doc.items, (row) => {
			total_authorized_amount += row.authorized_amount;
			total_claimed_amount += row.claimed_amount;
			total_difference_amount += row.difference_amount;
			total_copago_amount += row.copago;
		});

		frappe.run_serially([
			frm.set_value("monto_reclamado", total_claimed_amount),
			frm.set_value("monto_autorizado", total_authorized_amount),
			frm.set_value("diferencia", total_difference_amount),
			frm.set_value("copago", total_copago_amount),
			rades.sales_invoice.update_payment_table(frm, {"total_authorized_amount": total_authorized_amount, 
				"total_copago": total_copago_amount, 
				"total_difference_amount": total_difference_amount})
		])

		refresh_field("items");
	}
});
