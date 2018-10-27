frappe.provide("rades.sales_invoice");

frappe.ui.form.on("Sales Invoice", {
	"setup": (frm) => {
		$.each({"ars": "ars", "nss": "nss"}, (key, value) => {
			frm.add_fetch("_customer", key, value);
		});
	},
	"refresh": (frm) => {
		refresh_field("cobertura");
		frappe.run_serially([
			() => frappe.timeout(1),
			() => frm.trigger("hide_dashboard"),
         	() => frm.is_new() && frm.trigger("cobertura")
		]);

	},
	"validate": (frm) => {
		if (frm.doc.paid_amount != frm.doc.grand_total){
			frappe.msgprint("Favor verificar que el monto recibido $"+ frm.doc.paid_amount +" sea igual al facturado $"+ frm.doc.grand_total)
			validated = false;
		}

		let opts = {
			"method": "dgii.api.validate_ncf_limit"
		};
		
		opts.args = {
			"serie": frm.doc.naming_series
		};
		
		frappe.call(opts).done((response) =>{
			let doc = response.message;
		
			if (!doc) {
				frappe.msgprint("No hay mas comprobantes disponibles para esta serie");
				validated = false;
			}
		}).fail(() => frappe.msgprint("¡Ha ocurrido un error!"));

	},
	"onload_post_render": (frm) => { 
		if (frm.is_new() && frm.doc.tipo_de_factura == "Clientes Seguros") {
			frm.doc.cobertura = frappe.boot.conf.autorizado_por_seguros;
		} 

		frm.is_new() && frm.trigger("customer");

		frappe.run_serially([
			() => frappe.timeout(2.5),
			() => {
			frm.set_query("customer", () => {
				let condition = ["in", "Clientes"]

				if (frm.doc.tipo_de_factura == "Proveedores") {
					condition = ["in", "Proveedores"]
				} else if (frm.doc.tipo_de_factura == "Alquiler") {
					condition = ["in", "Alquiler"]
				}

				return {
					"query": "erpnext.controllers.queries.customer_query",
					"filters": {
						"customer_group": condition
					}
				};
			});


			frm.set_query("item_code", "items", () => {
				if (["Clientes Seguros", "Meds", "Servimerd"].includes(frm.doc.tipo_de_factura)) {
					return {
						"query": "rades.queries.item_by_ars",
						"filters": {
							"ars": frm.doc.ars
						}
					};
				} else {
					let item_group = frm.doc.tipo_de_factura == "Proveedores" ? "Consultas":
						frm.doc.tipo_de_factura == "Alquiler" ? "ALQUILER":
							["not in", "Consultas, ALQUILER"];
							
					return {
						"filters": {
							"item_name": item_group
						}
					};
				}
			});
		}]);

		frm.is_new() && frm.trigger("show_prompt");
		frm.toggle_reqd("cobertura", frm.doc.tipo_de_factura == "Clientes Seguros");
	},
	"before_submit": (frm) => {
		if ( frm.doc.tipo_de_factura == "Clientes Seguros" && !frm.doc.autorization) {
			frappe.throw("¡Necesita el numero de autorización para poder validar este documento!");
		}
		if ( frm.doc.tipo_de_factura == "Servimerd" && frm.doc.nss && !frm.doc.autorization) {
			frappe.throw("¡Necesita el numero de autorización para poder validar este documento!");
		}
		if ( frm.doc.tipo_de_factura == "Servimerd" && frm.doc.nss && !frm.doc.medico) {
			frappe.throw("¡Necesita el Medico para poder validar este documento!");
		}
	},
	before_cancel: (frm) => {
        validated = false;
        frappe.prompt([{
                "label": "Tipo de Anulacion",
                "fieldname": "opts",
                "fieldtype": "Select",
                "reqd": 1,
                "options": 
                    "01 Deterioro de Factura Pre-Impresa\n" +
                    "02 Errores de Impresión(Factura Pre-Impresa)\n" +
                    "03 Impresión defectuosa\n" +
                    "04 Duplicidad de Factura\n" +
                    "05 Corrección de la Información\n" +
                    "06 Cambio de Productos\n" +
                    "07 Devolución de Productos\n" +
                    "08 Omisión de Productos\n" +
                    "09 Errores en Secuencias NCF\n"
            }],
            update_fields, "Elija el motivo de la cancelacion", "Continuar");

        function update_fields(response) {
            frm.doc.tipo_de_anulacion = response.opts;
            frm._save("Update", () => {
                frm.save("Cancel");
            });
        }
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
	"show_prompt": (frm) => {
		frm.$wrapper.hide();

		let fields = [{
			"label": "Tipo de Factura", 
			"fieldname": "tipo_de_factura", 
			"fieldtype": "Select", 
			"options": "Clientes Privados\nClientes Seguros\nAlquiler\nProveedores\nServimerd\nMeds",
			"reqd": "1"
		}];

		let p = frappe.prompt(fields, (values) => {
			frm.set_value("tipo_de_factura", values.tipo_de_factura);
			frm.$wrapper.show();
		}, "Seleccione el tipo de Factura", "Siguiente");

		p.onhide = () => frm.$wrapper.show();
	},
	"referido": (frm) => {
		if (frm.doc.referido && frm.doc.items){
		}
	},
	"customer": (frm) => {	frappe.run_serially([
		() => frappe.timeout(2.5),
		() => {

			frm.set_df_property("cobertura", "read_only", frm.doc.tipo_de_factura == "Clientes Seguros" ? 0 : 1 , frm.docname, "items");
			frm.set_df_property("rate", "read_only", frm.doc.tipo_de_factura == "Alquiler" ? 0 : 1 , frm.docname, "items");
			refresh_field("items");

			if (frm.doc.tipo_de_factura == "Clientes Seguros") {
				frappe.db.get_value("Customer", frm.doc.customer, ["nss", "ars"], (data) => {
					$.each(data, (key, value) => frm.set_value(key, value));
					frm.toggle_display("ars", true);
				});
			}
			if (frm.doc.tipo_de_factura == "Servimerd") {
				let fieldlist = ["nss", "ars"];

				frappe.db.get_value("Customer", frm.doc.customer, fieldlist, (data) => {
					$.each(data, (key, value) => frm.set_value(key, value));
					frm.toggle_display("ars", true);
					frm.clear_table("payments");
					
					if ( ! (frm.doc.ars && frm.doc.nss)) {
						$.map(fieldlist, (field) => frm.set_value(field, undefined));
						frm.set_value("selling_price_list", "Venta estándar");
						frm.set_value("cobertura", 0);
						frm.add_child("payments", {
							"mode_of_payment": "Servimerd"
						});
					} else {
						$.map(["Seguro", "Servimerd"], (mode) => {
							frm.add_child("payments", {
								"mode_of_payment": mode
							});
						});
						
						frm.set_value("cobertura", frappe.boot.conf.autorizado_por_seguros);
					}
				});
			}

			if (frm.doc.tipo_de_factura == "Clientes Privados") {
				let fields_dict = {
					"cobertura": 0,
					"ars": null,
					"nss": null,
				};

				$.each(fields_dict, (field, value) => frm.set_value(field, value));

				frm.toggle_display("ars", false);
				frm.set_df_property("cobertura", "read_only", 1, frm.docname, "items");
				refresh_field("items");

			}

			if (frm.doc.tipo_de_factura == "Meds") {
				let fields_dict = {
					"cobertura": 100,
					"ars": frm.doc.tipo_de_factura,
					"selling_price_list": frm.doc.tipo_de_factura,
					"nss": null,
				};

				$.each(fields_dict, (field, value) => frm.set_value(field, value));

				frm.toggle_display("ars", false);
			}

			// It's necessary to clear the table everytime you change 'tipo de factura' to guarantee an accurate price list
			frm.clear_table('items')
			//frm.add_child('items', {})
			refresh_field('items')

			frm.clear_custom_buttons();

			if (frm.doc.tipo_de_factura != "Proveedores") {
				return 0; // exit code is zero
				} 

			frm.add_custom_button("Cargar Facturas", () => {
				let d = new frappe.ui.form.MultiSelectDialog({
					"doctype": "Sales Invoice",
					"target": frm,
					"date_field": "posting_date",
					"setters": {
						"ars": frm.doc.customer == "SERVIMERD" ? undefined: frm.doc.customer,
						"tipo_de_factura": frm.doc.customer == "SERVIMERD" ? "Servimerd": undefined
					},
					"get_query": () => {
						return { 
							"filters": { 
								"customer_group": "Clientes", 
								"tipo_de_factura": ["in", "Clientes Seguros, Meds, Servimerd"],
								"payment_status": "UNPAID",
								"docstatus": 1
							} 
						};
					},
					"action": (selections, args) => {

						if (selections.length == 0) {
							frappe.throw("Favor de seleccionar las facturas!");
						}

						d.dialog.hide();
						rades.sales_invoice.add_row_and_update_sales_invoices(frm, selections, args);
					}
				});

				d.dialog.fields_dict.ars.df.get_query = () => {
					return {
						"query": "rades.queries.customer_query",
						"filters": {
							"customer_group": "Proveedores"
						}
					};
				};
			});
		}
	]); },
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
	},
	"item_table_update": (frm, cdt, cdn) => {

		// let row = frappe.get_doc(cdt, cdn);
		// () => frappe.timeout(3);
		// let cobertura = flt(row.cobertura) / 100.000;
		
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
	"cobertura": (frm) => {
		$.map(frm.doc.items, (row) => {
			frappe.model.set_value(row.doctype, row.name, "cobertura", frm.doc.cobertura);
		});
	},
	"hide_dashboard": (frm) => {
		frm.dashboard.wrapper.parent().addClass("hide")
			.parent().find(".section-head").addClass("collapsed")
			.find(".octicon.collapse-indicator.octicon-chevron-up")
			.removeClass()
			.addClass("octicon collapse-indicator octicon-chevron-down");
	},
	"ars": (frm) => {
		frm.doc.ars && frm.set_value("selling_price_list", frm.doc.ars);
		if (frm.doc.ars == "ARS UNIVERSAL") {
			frm.set_value("cobertura", 45);
		}
	}
});

frappe.ui.form.on("Sales Invoice Item", {
	"item_code": (frm, cdt, cdn) => {
		let condition = frm.doc.tipo_de_factura != "Alquiler" && frm.doc.tipo_de_factura != "Proveedores" ? true : false
		
		if (es_referido(frm)){
			frappe.run_serially([
				() => row = frappe.get_doc(cdt, cdn),
				() => frappe.timeout(0.5),
				() => nuevo_descuento = get_discount(row),
				() => frappe.model.set_value(cdt, cdn, "discount_percentage", nuevo_descuento)
			]);
		}

		frappe.run_serially([
			() => frappe.timeout(0.3),
			() => condition && frm.events.item_table_update(frm, cdt, cdn),
			() => frappe.timeout(1.3),
			() => frm.cscript.calculate_paid_amount(),
			() => frm.refresh_fields()
		]);
	},
	"items_remove": (frm, cdt, cdn) => {
		frm.trigger("refresh_outside_amounts");
	},
	"discount_percentage": (frm, cdt, cdn) => {
		frappe.run_serially([
			() => frappe.timeout(0.3),
			() => frm.events.item_table_update(frm, cdt, cdn),
		]);
	},
	"qty": (frm, cdt, cdn) => {
		frappe.run_serially([
			() => frappe.timeout(0.3),
			() => frm.events.item_table_update(frm, cdt, cdn),
		]);
	},
	"rate": (frm, cdt, cdn) => {
		let condition = frm.doc.tipo_de_factura != "Alquiler" && frm.doc.tipo_de_factura != "Proveedores" ? true : false
		frappe.run_serially([
			() => frappe.timeout(0.3),
			() => condition && frm.events.item_table_update(frm, cdt, cdn),
		]);
	},
	"cobertura": (frm, cdt, cdn) => {
		frappe.run_serially([
			() => frappe.timeout(0.3),
			() => frm.events.item_table_update(frm, cdt, cdn),
		]);
	},
	"items_add": (frm, cdt, cdn) => {
		frappe.model.set_value(cdt, cdn, "cobertura", frm.doc.cobertura);
	}
});

$.extend(rades.sales_invoice, {
	"add_row_and_update_sales_invoices": (frm, selections, args) => {
		let opts = {
			"method": "rades.api.update_sales_invoice"
		};
		
		opts.args = {
			"doc": frm.doc,
			"selections": selections.join(","),
			"args": args
		};
		
		frappe.call(opts).done((response) =>{
			let doc = response.message;
		
			if (doc) {
				frappe.model.sync(doc) && frm.refresh();
			}
		}).fail(() => frappe.msgprint("¡Ha ocurrido un error!"));
	},
	"update_payment_table": (frm, opts) => {
		
		$.grep(frm.doc.payments, (payment) => {
			return payment.mode_of_payment == "Efectivo";
		}).map((payment) => {
			payment.amount = opts.total_difference_amount;
		});

		$.grep(frm.doc.payments, (payment) => {
			return payment.mode_of_payment == "Co-Pago";
		}).map((payment) => {
			payment.amount = opts.total_copago;
		});

		$.grep(frm.doc.payments, (payment) => {
			return payment.mode_of_payment == "Seguro";
		}).map((payment) => {
			payment.amount = opts.total_authorized_amount;
		});

		$.grep(frm.doc.payments, (payment) => {
			return payment.mode_of_payment == "Meds";
		}).map((payment) => {
			payment.amount = opts.total_authorized_amount;
		});

		$.grep(frm.doc.payments, (payment) => {
			return payment.mode_of_payment == "Servimerd";
		}).map((payment) => {
			payment.amount = opts.total_difference_amount;
		});

		refresh_field("payments");
	}
});

cur_frm.amend_doc = () => {
    var fn = function(newdoc) {
        newdoc.amended_from = "";
        newdoc.tipo_de_anulacion = "";
        refresh_field("amended_from");
    }
    cur_frm.copy_doc(fn)
}
function aplicar_descuento (frm, cdt, cdn, row)  {
		row.discount_percentage = 50
		//frm.events.item_table_update(frm, cdt, cdn)
	}

function es_referido (frm) {
		if (frm.doc.referido && frm.doc.centro_de_salud)
			return true;
		else
			return false;
	}

function get_discount(row){
	let porciento = 0.00;

	$.grep(frappe.boot.conf.descuentos_especiales, (descuento) => {
		return descuento.item == row.item_code;
	}).map((descuento) => {
		if (descuento)
			porciento = descuento.discount;
	});

	return porciento
}

function aplicar_copago(row, frm){
	// if (has_clearance(row, frm) && es_jueves(frm) && frm.doc.tipo_de_factura == "Clientes Seguros" && frm.doc.ars != "ARS UNIVERSAL")
	if (has_clearance(row, frm) && frm.doc.tipo_de_factura == "Clientes Seguros" && frm.doc.ars != "ARS UNIVERSAL")
		return true
	else
		return false
}

function has_clearance(row, frm){
	let aplicar_descuento = false;
	
	$.grep(frappe.boot.conf.ofertas_jueves, (oferta) => {
		
		return oferta.item == row.item_code && oferta.day == get_today(frm);
	}).map((oferta) => {
		if (oferta)
			aplicar_descuento = true;
	});

	return aplicar_descuento
}

function aplicar_porciento(row){

	if (row && row.item_name)
		return row.item_name.substring(0,10) != "Diferencia";
}

function es_jueves(frm) {
	
	return get_today(frm) == "Thu"  ? true : false;
}

function get_today(frm){
	let year = frm.doc.posting_date.split("-")[0]
	// we have to substract 1 to the actual month since Javascript treat months from 0-11
	let month = eval(frm.doc.posting_date.split("-")[1]) - 1
	let day = frm.doc.posting_date.split("-")[2]
	
	let weekday = new Date(year, month, day).toString().split(" ")[0]

	return weekday
}

