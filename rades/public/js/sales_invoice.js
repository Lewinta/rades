frappe.provide("rades.sales_invoice");

function update_selling_price_list_from_ars(frm, ars) {
	return frm.set_value("selling_price_list", ars ? ars : "Venta estándar");
}

function get_cargar_facturas_setters(frm) {
	const ars_df = frappe.meta.docfield_map["Sales Invoice"]["ars"];
	const tipo_df = frappe.meta.docfield_map["Sales Invoice"]["tipo_de_factura"];
	const is_servimerd = frm.doc.customer == "SERVIMERD";
	const posting_date = frm.doc.posting_date || frappe.datetime.get_today();

	return [
		{
			fieldtype: ars_df.fieldtype,
			fieldname: "ars",
			label: ars_df.label,
			options: ars_df.options,
			default: is_servimerd ? undefined : frm.doc.customer,
			read_only: is_servimerd ? 0 : 1,
		},
		{
			fieldtype: tipo_df.fieldtype,
			fieldname: "tipo_de_factura",
			label: tipo_df.label,
			options: tipo_df.options,
			default: is_servimerd ? "Servimerd" : undefined,
		},
		{
			fieldtype: "Date Range",
			fieldname: "posting_date_range",
			label: __("Rango de Fechas"),
			default: [
				moment(posting_date).startOf("month").format("YYYY-MM-DD"),
				posting_date,
			],
		},
	];
}

function setup_cargar_facturas_date_filters(dialog) {
	const original_get_args = dialog.get_args_for_search.bind(dialog);

	dialog.get_datatable_columns = function () {
		return ["name", "posting_date", "ars", "tipo_de_factura"];
	};

	dialog.get_args_for_search = function () {
		const args = original_get_args();
		const date_range = args.filters.posting_date_range;

		delete args.filters.posting_date_range;

		if (args.filter_fields) {
			args.filter_fields = args.filter_fields.filter(
				(field) => field !== "posting_date_range"
			);
		}

		if (date_range && date_range.length === 2) {
			const [from_date, to_date] = date_range;
			if (from_date && to_date) {
				args.filters.posting_date = ["between", [from_date, to_date]];
			} else if (from_date) {
				args.filters.posting_date = [">=", from_date];
			} else if (to_date) {
				args.filters.posting_date = ["<=", to_date];
			}
		}

		if (args.filter_fields && !args.filter_fields.includes("posting_date")) {
			args.filter_fields.push("posting_date");
		}

		return args;
	};
}

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
			() => frm.is_new() && frm.trigger("cobertura"),
			() => frm.trigger("add_custom_button")
		]);
		let show = frappe.user.has_role("Accounts Manager");
		frm.toggle_enable("ncf", show);
		
	},
	set_queries: (frm) => {
		frm.set_query("customer", () => {
			const group_by_tipo = {
				"Proveedores": "Proveedores",
				"Alquiler": "Alquiler",
			};
			const customer_group = group_by_tipo[frm.doc.tipo_de_factura] || "Clientes";

			return {
				"query": "rades.queries.customer_query",
				"filters": {
					"customer_group": customer_group,
				},
			};
		});

		// frm.set_query("item_code", "items", () => {
		// 	if (["Clientes Seguros", "Meds", "Servimerd"].includes(frm.doc.tipo_de_factura)) {
		// 		return {
		// 			"query": "rades.queries.item_by_ars",
		// 			"filters": {
		// 				"ars": frm.doc.ars,
		// 			},
		// 		};
		// 	}

		// 	let item_filter;
		// 	if (frm.doc.tipo_de_factura === "Proveedores") {
		// 		item_filter = "Consultas";
		// 	} else if (frm.doc.tipo_de_factura === "Alquiler") {
		// 		item_filter = "ALQUILER";
		// 	} else {
		// 		item_filter = ["not in", ["Consultas", "ALQUILER"]];
		// 	}

		// 	return {
		// 		"filters": {
		// 			"item_name": item_filter,
		// 		},
		// 	};
		// });
	},
	"add_custom_button": (frm) => {
		frm.add_custom_button(__("Actualizar informacion personal"), () => {
			frappe.call(
				"rades.sales_invoice.update_personal_info",
				{"self": frm.doc}
			).done(() => {
				frappe.show_alert("Informacion Personal Actualizada", 10);
				frm.reload_doc();
			});
		});
		if (frm.doc.docstatus == 1) {
		}
	},
	"onload_post_render": (frm) => {
		if (frm.is_new() && frm.doc.tipo_de_factura == "Clientes Seguros") {
			frm.doc.cobertura = frappe.boot.conf.autorizado_por_seguros;
		}

		frm.is_new() && frm.trigger("customer");
		frm.is_new() && !frm.doc.is_return && frm.trigger("show_prompt");
		frm.toggle_reqd("cobertura", frm.doc.tipo_de_factura == "Clientes Seguros");

		frm.trigger("set_queries");
	},
	"tipo_de_factura": (frm) => {
		// The customer query depends on tipo_de_factura, so any previously
		// picked customer may no longer be valid for the new group.
		if (frm.doc.customer) {
			frm.set_value("customer", null);
		}
		frm.toggle_reqd("cobertura", frm.doc.tipo_de_factura == "Clientes Seguros");
	},
	"before_submit": (frm) => {
		if ( frm.doc.tipo_de_factura == "Clientes Seguros" && !frm.doc.medico) {
			frappe.throw("¡Necesita el medico para poder validar este documento!");
		}
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
    "ars": (frm) => {
    	update_selling_price_list_from_ars(frm, frm.doc.ars);
    },

	"customer": (frm) => {	frappe.run_serially([
		() => frappe.timeout(2.5),
		() => {

			frm.set_df_property("items", "read_only", frm.doc.tipo_de_factura == "Clientes Seguros" ? 0 : 1 , frm.docname, "cobertura");
			frm.set_df_property("items", "read_only", ["Alquiler", "Proveedores"].includes(frm.doc.tipo_de_factura) ? 0 : 1 , frm.docname, "rate");
			refresh_field("items");

			if (frm.doc.tipo_de_factura == "Clientes Seguros") {
				frappe.db.get_value("Customer", frm.doc.customer, ["nss", "ars"], (data) => {
					frappe.run_serially([
						() => frm.set_value("nss", data.nss),
						() => frm.set_value("ars", data.ars),
						() => update_selling_price_list_from_ars(frm, data.ars),
						() => frm.toggle_display("ars", true),
					]);
				});
			}
			if (frm.doc.tipo_de_factura == "Servimerd") {
				let fieldlist = ["nss", "ars"];

				frappe.db.get_value("Customer", frm.doc.customer, fieldlist, (data) => {
					const mop_added = new Set();

					frappe.run_serially([
						() => frm.set_value("nss", data.nss),
						() => frm.set_value("ars", data.ars),
						() => update_selling_price_list_from_ars(frm, data.ars),
						() => frm.toggle_display("ars", true),
						() => !frm.doc.is_return && frm.clear_table("payments"),
						() => {
							if (!(data.ars && data.nss)) {
								return frappe.run_serially([
									() => frm.set_value("nss", undefined),
									() => frm.set_value("ars", undefined),
									() => update_selling_price_list_from_ars(frm, null),
									() => frm.set_value("cobertura", 0),
									() => {
										if (!mop_added.has("Servimerd")) {
											frm.add_child("payments", {
												"mode_of_payment": "Servimerd"
											});
											mop_added.add("Servimerd");
										}
									},
								]);
							}

							return frappe.run_serially([
								() => frm.set_value("cobertura", frappe.boot.conf.autorizado_por_seguros),
								() => {
									$.map(["Seguro", "Servimerd"], (mode) => {
										if (!mop_added.has(mode)) {
											frm.add_child("payments", {
												"mode_of_payment": mode
											});
											mop_added.add(mode);
										}
									});
								},
							]);
						},
					]);
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
				frm.set_df_property("items", "read_only", 1, frm.docname, "cobertura");
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
			!frm.doc.is_return && frm.clear_table('items');
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
					"page_length": 10000,
					"setters": get_cargar_facturas_setters(frm),
					"get_query": () => {
						return {
							"filters": {
								"customer_group": "Clientes",
								"tipo_de_factura": ["in", "Clientes Seguros, Meds, Servimerd"],
								"payment_status": frm.doc.is_return == 1? "PAID": "UNPAID",
								"docstatus": 1,
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

				setup_cargar_facturas_date_filters(d);

				// Ensanchar el dialogo al 70% del viewport para que los filtros
				// (setters) queden en una sola linea horizontal.
				d.dialog.$wrapper.find(".modal-dialog").css("max-width", "70vw");

				d.get_results();

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
	"item_table_update": (frm, cdt, cdn) => {
		const row = frappe.get_doc(cdt, cdn);
		if (!row || !row.item_code) {
			return;
		}

		const apply_pct = aplicar_porciento(row);
		const cobertura = flt(row.cobertura) / 100.0;
		const thursday_clearance = has_clearance(row, frm) && es_jueves(frm);

		// En facturas de seguros los campos se calculan desde el precio base
		// (price_list_rate); el rate ajustado por copago/descuento generaria
		// una dependencia circular. En los demas tipos se conserva el rate.
		const base = is_insurance_invoice(frm) ? get_base_rate(row) : flt(row.rate);

		row.authorized_amount = apply_pct ? base * cobertura : 0;
		row.claimed_amount    = apply_pct ? base : 0;

		const gross_difference = base - row.authorized_amount;
		if (thursday_clearance) {
			// Jueves: toda la brecha va al copago; la diferencia netea a cero.
			row.copago = gross_difference;
			row.difference_amount = 0;
		} else {
			// copago + difference_amount = gross_difference (brecha total del paciente).
			row.difference_amount = gross_difference - flt(row.copago);
		}

		// El copago suma/resta a la diferencia segun su signo y se traslada al
		// rate (Monto) a traves del descuento nativo de ERPNext.
		apply_copago_discount(frm, cdt, cdn);

		refresh_field("items");
		frm.trigger("refresh_outside_amounts");
	},
	"refresh_outside_amounts": (frm) => {
		let total_authorized_amount = 0.0;
		let total_claimed_amount    = 0.0;
		let total_difference_amount = 0.0;
		let total_copago_amount     = 0.0;

		$.map(frm.doc.items || [], (row) => {
			total_authorized_amount += flt(row.authorized_amount);
			total_claimed_amount    += flt(row.claimed_amount);
			total_difference_amount += flt(row.difference_amount);
			total_copago_amount     += flt(row.copago);
		});

		frm.set_value("monto_reclamado", total_claimed_amount);
		frm.set_value("monto_autorizado", total_authorized_amount);
		frm.set_value("diferencia", total_difference_amount);
		frm.set_value("copago", total_copago_amount);

		rades.sales_invoice.update_payment_table(frm, {
			"total_authorized_amount": total_authorized_amount,
			"total_copago": total_copago_amount,
			"total_difference_amount": total_difference_amount,
		});

		refresh_field("items");
	},
	"cobertura": (frm) => {
		$.map(frm.doc.items, (row) => {
			frappe.model.set_value(row.doctype, row.name, "cobertura", frm.doc.cobertura);
		});
	},
	"hide_dashboard": (frm) => {
		if (frm.dashboard && frm.dashboard.parent) {
			$(frm.dashboard.parent).addClass("hide");
		}
	}
});

frappe.ui.form.on("Sales Invoice Item", {
	"item_code": (frm, cdt, cdn) => {
		let condition = frm.doc.tipo_de_factura != "Proveedores" ? true : false

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
			() => { if(frm.doc.tipo_de_factura == "Alquiler") {
				frappe.model.set_value(cdt, cdn, "claimed_amount", row.rate);
				frappe.model.set_value(cdt, cdn, "difference_amount", row.rate);
			} },
			() => frm.cscript.calculate_paid_amount(),
			() => frm.refresh_fields()
		]);
	},
	"items_remove": (frm, cdt, cdn) => {
		frm.trigger("refresh_outside_amounts");
	},
	"discount_percentage": (frm, cdt, cdn) => {
		// Cambio real del % (usuario o flujo de referidos): se actualiza el
		// porcentaje guardado para combinarlo con el copago en el descuento.
		const row = frappe.get_doc(cdt, cdn);
		row.__referral_pct = flt(row.discount_percentage);

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
		const row = frappe.model.get_doc(cdt, cdn);
		row.cobertura = frm.doc.cobertura;
	},
	"copago": (frm, cdt, cdn) => {
		const row = frappe.get_doc(cdt, cdn);
		const base = is_insurance_invoice(frm) ? get_base_rate(row) : flt(row.rate);
		const gross_difference = base - flt(row.authorized_amount);

		// Copago positivo: descuenta de la brecha total, no puede excederla.
		// Copago negativo: aumenta la diferencia neta (el rate sube), se permite.
		if (flt(row.copago) > 0 && flt(row.copago) > gross_difference) {
			frappe.throw("El copago no puede ser mayor a la diferencia");
			return;
		}

		frappe.run_serially([
			() => frappe.timeout(0.3),
			() => frm.events.item_table_update(frm, cdt, cdn),
		]);
	},
	"adjustment": (frm, cdt, cdn) => {
		row = frappe.model.get_doc(cdt,cdn);

		frappe.run_serially([
			() => frappe.timeout(0.3),
			() => frm.events.item_table_update(frm, cdt, cdn),
		]);
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

function is_insurance_invoice(frm) {
	return ["Clientes Seguros", "Servimerd", "Meds"].includes(frm.doc.tipo_de_factura);
}

// Precio base de la linea: el precio de lista, nunca el rate ya ajustado por
// descuentos/copago, para evitar dependencia circular en los calculos de seguro.
function get_base_rate(row) {
	return flt(row.price_list_rate) || flt(row.rate_with_margin) || flt(row.rate);
}

// ERPNext ignora discount_amount si la linea no tiene price_list_rate
// (ver apply_discount_on_item en erpnext/public/js/controllers/transaction.js),
// asi que se siembra desde el rate actual cuando falta.
function ensure_price_list_rate(row) {
	const base = get_base_rate(row);

	if (!flt(row.price_list_rate) && base) {
		row.price_list_rate = base;
	}

	return base;
}

function apply_copago_discount(frm, cdt, cdn) {
	const row = frappe.get_doc(cdt, cdn);
	if (!row || !row.item_code) {
		return;
	}

	if (!is_insurance_invoice(frm)) {
		console.debug("[rades] copago: sin ajuste de rate para tipo_de_factura =", frm.doc.tipo_de_factura);
		return;
	}

	const base = ensure_price_list_rate(row);
	if (!base) {
		console.debug("[rades] copago: sin precio base en la linea", row.item_code);
		return;
	}

	// El % de descuento por referido se conserva aparte, porque ERPNext
	// recalcula discount_percentage a partir de discount_amount y se perderia.
	if (row.__referral_pct === undefined) {
		row.__referral_pct = flt(row.discount_percentage);
	}

	const referral_discount = (base * flt(row.__referral_pct)) / 100.0;
	// target_rate = base - referral - copago (copago con signo)
	const total_discount = referral_discount + flt(row.copago);

	console.debug("[rades] copago discount", {
		"item": row.item_code,
		"base": base,
		"copago": flt(row.copago),
		"total_discount": total_discount,
	});

	// Se usa frappe.model.set_value para que corran los triggers nativos de
	// ERPNext (apply_discount_on_item -> apply_pricing_rule_on_item ->
	// calculate_taxes_and_totals) y el rate (Monto) quede consistente.
	if (total_discount >= 0) {
		row.margin_type = "";
		row.margin_rate_or_amount = 0;
		return frappe.model.set_value(cdt, cdn, "discount_amount", total_discount);
	}

	// Copago negativo: el rate sube por encima del precio de lista.
	// ERPNext no acepta descuentos negativos, se aplica como margen.
	row.discount_percentage = 0;
	row.discount_amount = 0;
	return frappe.run_serially([
		() => frappe.model.set_value(cdt, cdn, "margin_type", "Amount"),
		() => frappe.model.set_value(cdt, cdn, "margin_rate_or_amount", -total_discount),
	]);
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

