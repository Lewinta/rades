frappe.provide("rades.sales_invoice");

// En una devolucion la lista de precios se hereda de la factura original y no se
// toca. Cambiarla hace que ERPNext re-cotice TODAS las lineas, y si el precio
// vigente en la lista nueva supera el rate de la factura, ERPNext rechaza la nota
// con "Row # N: Rate cannot be greater than the rate used in Sales Invoice ...".
//
// Es lo que rompia las NC de Clientes Seguros: la factura se guarda con
// "Venta estandar" mientras que el cliente tiene ARS, asi que al abrir la NC el
// trigger de customer cambiaba la lista a la de la ARS y re-cotizaba. En
// FACT-170537 eso movio RX MIEMBRO INFERIOR AP Y LAT de 534.90 (Venta estandar) a
// 535.48 (SEGURO FAMILIAR DE SALUD) y la nota ya no se podia guardar.
function update_selling_price_list_from_ars(frm, ars) {
	if (frm.doc.is_return) {
		return;
	}
	return frm.set_value("selling_price_list", ars ? ars : "Venta estándar");
}

function _payment_accounting_signature(payments) {
	return (payments || [])
		.map((row) =>
			[
				row.name || "",
				row.mode_of_payment || "",
				row.account || "",
				flt(row.amount),
				flt(row.base_amount),
			].join("|")
		)
		.join(";");
}

function _submitted_pos_payments_may_repost(frm) {
	const before = frm._rades_payments_before_edit;
	if (!before) {
		return frm.is_dirty();
	}
	return _payment_accounting_signature(frm.doc.payments) !== before;
}

function get_cargar_facturas_setters(frm) {
	const ars_df = frappe.meta.docfield_map["Sales Invoice"]["ars"];
	const tipo_df = frappe.meta.docfield_map["Sales Invoice"]["tipo_de_factura"];
	const status_df = frappe.meta.docfield_map["Sales Invoice"]["status"];
	const is_servimerd = frm.doc.customer == "SERVIMERD";

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
			fieldtype: status_df.fieldtype,
			fieldname: "status",
			label: status_df.label,
			options: status_df.options,
			default: "Paid",
		},
		{
			fieldtype: "Date Range",
			fieldname: "posting_date_range",
			label: __("Rango de Fechas"),
		},
	];
}

function setup_cargar_facturas_loading(dialog) {
	const original_get_results = dialog.get_results.bind(dialog);
	const $results = dialog.$results;
	let pending_requests = 0;

	$results.css("position", "relative");
	const $loading = $(`
		<div class="cargar-facturas-loading">
			<div>
				<span class="spinner-border spinner-border-sm" role="status"></span>
				<span>${__("Buscando facturas...")}</span>
			</div>
		</div>
	`).css({
		position: "absolute",
		inset: 0,
		display: "none",
		"align-items": "center",
		"justify-content": "center",
		"z-index": 5,
		background: "rgba(255, 255, 255, 0.82)",
		"font-weight": 500,
	});
	$results.append($loading);

	dialog.get_results = async function (...args) {
		pending_requests += 1;
		$loading.css("display", "flex");
		dialog.dialog.get_primary_btn().prop("disabled", true);

		try {
			return await original_get_results(...args);
		} finally {
			pending_requests -= 1;
			if (pending_requests === 0) {
				$loading.hide();
				dialog.dialog.get_primary_btn().prop("disabled", false);
			}
		}
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
			// En una devolucion la cobertura ya viene en cada linea copiada de la
			// factura. Re-empujarla dispara item_table_update, que re-deriva el
			// rate via apply_copago_discount y puede dejarlo por encima del de la
			// factura original.
			() => frm.is_new() && !frm.doc.is_return && frm.trigger("cobertura"),
			() => frm.trigger("add_custom_button")
		]);
		toggle_proveedores_print_qty_field(frm);
		let show = frappe.user.has_role("Accounts Manager");
		frm.toggle_enable("ncf", show);
		if (frm.doc.docstatus === 1 && cint(frm.doc.is_pos)) {
			frm._rades_payments_before_edit = _payment_accounting_signature(frm.doc.payments);
		} else {
			frm._rades_payments_before_edit = null;
		}
	},
	"before_save": (frm) => {
		if (frm.doc.docstatus !== 1 || !cint(frm.doc.is_pos)) {
			return;
		}
		if (!_submitted_pos_payments_may_repost(frm)) {
			return;
		}
		frappe.show_alert({
			message: __(
				"Saving will rebuild accounting entries if Mode of Payment / payment account changed."
			),
			indicator: "orange",
		});
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
		}, __("Actions"));
		if (frm.doc.docstatus == 1) {
		}
	},
	"onload_post_render": (frm) => {
		if (frm.is_new() && frm.doc.tipo_de_factura == "Clientes Seguros") {
			frm.doc.cobertura = frappe.boot.conf.autorizado_por_seguros;
		}

		// El trigger de customer reconstruye la factura desde cero: relee nss/ars,
		// cambia la lista de precios, reajusta cobertura y rearma la tabla de
		// pagos. Todo eso pisa lo que make_sales_return ya copio de la factura
		// original, asi que en una devolucion no debe correr.
		frm.is_new() && !frm.doc.is_return && frm.trigger("customer");
		frm.is_new() && !frm.doc.is_return && frm.trigger("show_prompt");
		frm.toggle_reqd("cobertura", frm.doc.tipo_de_factura == "Clientes Seguros");
		toggle_proveedores_print_qty_field(frm);

		frm.trigger("set_queries");
	},
	"tipo_de_factura": (frm) => {
		// The customer query depends on tipo_de_factura, so any previously
		// picked customer may no longer be valid for the new group.
		if (frm.doc.customer) {
			frm.set_value("customer", null);
		}
		frm.toggle_reqd("cobertura", frm.doc.tipo_de_factura == "Clientes Seguros");
		toggle_proveedores_print_qty_field(frm);
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

			// Proveedores y Alquiler facturan a la aseguradora o al arrendatario,
			// no a un paciente: nunca llevan ARS ni NSS. Sin esta rama nadie los
			// limpiaba, porque el trigger de tipo_de_factura solo borra customer y
			// el get_party_details de ERPNext solo repone selling_price_list. Si el
			// cajero elegia un paciente en Clientes Seguros y despues cambiaba el
			// tipo, el ARS/NSS del paciente sobrevivia hasta el submit (y ambos son
			// read_only, asi que no habia forma de corregirlo desde el formulario).
			// Fue lo que dejo "HUMANO SEGUROS, SA" en FACT-94908, una factura a ARS APS.
			if (["Proveedores", "Alquiler"].includes(frm.doc.tipo_de_factura)) {
				let fields_dict = {
					"ars": null,
					"nss": null,
				};

				!frm.doc.is_return && $.each(fields_dict, (field, value) => frm.set_value(field, value));
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
					"columns": ["name", "posting_date", "ars", "tipo_de_factura", "status"],
					"setters": get_cargar_facturas_setters(frm),
					"get_query": () => {
						return {
							"query": "rades.queries.cargar_facturas_query",
							"filters": {
								"customer_group": "Clientes",
								"supplier_ars": frm.doc.customer == "SERVIMERD"
									? undefined
									: frm.doc.customer,
								"allowed_tipo_de_factura": [
									"Clientes Seguros",
									"Meds",
									"Servimerd",
								],
								"default_status": "Paid",
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

				setup_cargar_facturas_loading(d);

				// Ensanchar el dialogo para que los filtros (setters) quepan
				// en una sola linea horizontal.
				d.dialog.$wrapper.find(".modal-dialog").css("max-width", "80vw");

				// Frappe reparte los setters en 3 columnas (index % 3) y cada
				// .form-column envuelve sus controles en un <form>, por lo que el
				// buscador y "Rango de Fechas" quedan apilados. En vez de pelear con
				// ese anidamiento, movemos los 5 controles a una fila flex propia.
				const $wrapper = d.dialog.$wrapper;
				const $filtros = $(
					'<div class="cargar-facturas-filtros"></div>'
				).css({
					display: "flex",
					"flex-wrap": "nowrap",
					"align-items": "flex-end",
					gap: "12px",
					"margin-bottom": "10px",
				});
				const filtros_orden = [
					"search_term",
					"ars",
					"tipo_de_factura",
					"status",
					"posting_date_range",
				];
				filtros_orden.forEach((fieldname) => {
					const $control = $wrapper.find(
						`.frappe-control[data-fieldname="${fieldname}"]`
					);
					if (!$control.length) return;
					// Rango de fechas necesita mas ancho (dos inputs de fecha).
					const grow = fieldname === "posting_date_range" ? "1.8" : "1";
					$control
						.css({ flex: `${grow} 1 0`, "min-width": "0", margin: "0" })
						.appendTo($filtros);
				});
				$filtros.prependTo($wrapper.find(".modal-body"));

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

		// En una devolucion los montos de la linea vienen de la factura original y
		// no se re-derivan: apply_copago_discount escribe discount_amount /
		// margin_rate_or_amount, o sea reescribe el rate, y ERPNext no acepta que
		// el rate de una devolucion supere el de la factura. Los totales del
		// header si se recalculan, por si se borran lineas.
		if (frm.doc.is_return) {
			frm.trigger("refresh_outside_amounts");
			return;
		}

		const apply_pct = aplicar_porciento(row);
		const cobertura = flt(row.cobertura) / 100.0;
		// La oferta de jueves manda toda la brecha al copago y deja la diferencia
		// en 0. has_clearance() solo mira ofertas_jueves, sin filtrar por tipo de
		// factura, asi que en una factura NO de seguro (donde el autorizado es 0
		// y la brecha es el rate completo) el copago se comia el rate entero y el
		// e-CF habria salido por 0.00. El copago es un concepto de seguros.
		const thursday_clearance =
			is_insurance_invoice(frm) && has_clearance(row, frm) && es_jueves(frm);

		// En facturas de seguros los campos se calculan desde el precio base
		// (price_list_rate); el rate ajustado por copago/descuento generaria
		// una dependencia circular. En los demas tipos se conserva el rate.
		const base = is_insurance_invoice(frm) ? get_base_rate(row) : flt(row.rate);

		row.authorized_amount = flt(apply_pct ? base * cobertura : 0, 2);
		row.claimed_amount    = flt(apply_pct ? base : 0, 2);

		const gross_difference = base - row.authorized_amount;
		if (thursday_clearance) {
			// Jueves: toda la brecha va al copago; la diferencia netea a cero.
			row.copago = flt(gross_difference, 2);
			row.difference_amount = 0;
		} else {
			// copago + difference_amount = gross_difference (brecha total del paciente).
			row.difference_amount = flt(gross_difference - flt(row.copago), 2);
		}

		// El copago suma/resta a la diferencia segun su signo y se traslada al
		// rate (Monto) a traves del descuento nativo de ERPNext.
		apply_copago_discount(frm, cdt, cdn);

		refresh_field("items");
		frm.trigger("refresh_outside_amounts");
	},
	"items_on_form_rendered": (frm) => {
		show_print_qty_in_item_detail(frm);
	},
	"refresh_outside_amounts": (frm) => {
		let total_authorized_amount = 0.0;
		let total_claimed_amount    = 0.0;
		let total_difference_amount = 0.0;
		let total_copago_amount     = 0.0;

		// Mismo criterio que rades.sales_invoice._apply_return_sign en el servidor:
		// en una nota de credito estos montos van en negativo, igual que amount y
		// grand_total. Antes se mostraban en positivo contra un Grand Total
		// negativo, y los reportes que los suman contaban la NC como una venta.
		const sign = frm.doc.is_return ? -1 : 1;

		$.map(frm.doc.items || [], (row) => {
			total_authorized_amount += Math.abs(flt(row.authorized_amount));
			total_claimed_amount    += Math.abs(flt(row.claimed_amount));
			total_difference_amount += Math.abs(flt(row.difference_amount));
			total_copago_amount     += Math.abs(flt(row.copago));
		});

		total_authorized_amount *= sign;
		total_claimed_amount    *= sign;
		total_difference_amount *= sign;
		total_copago_amount     *= sign;

		frm.set_value("monto_reclamado", flt(total_claimed_amount, 2));
		frm.set_value("monto_autorizado", flt(total_authorized_amount, 2));
		frm.set_value("diferencia", flt(total_difference_amount, 2));
		frm.set_value("copago", flt(total_copago_amount, 2));

		// La tabla de pagos de una devolucion es el desglose de la factura
		// original en negativo, no algo que se derive de los montos de aqui.
		// La reconstruye rades.sales_invoice._restore_return_payments al guardar.
		if (!frm.doc.is_return) {
			rades.sales_invoice.update_payment_table(frm, {
				"total_authorized_amount": total_authorized_amount,
				"total_copago": total_copago_amount,
				"total_difference_amount": total_difference_amount,
			});
		}

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
			// Con use_legacy_js_reactivity = 0, ERPNext resuelve el item en el
			// servidor (process_item_selection) y al volver sincroniza la linea
			// completa con authorized_amount = 0. El timeout solo da tiempo a que esa
			// llamada salga; hay que esperar su respuesta o pisa el calculo. Pasaba
			// cuando el servidor tardaba mas de 0.3 s (FACT-95232: Autorizado 0.00).
			() => frappe.after_ajax(),
			() => condition && frm.events.item_table_update(frm, cdt, cdn),
			() => frappe.timeout(1.3),
			// Antes este paso corria solo para Alquiler y leia una variable `row`
			// global que solo se asigna en la rama de referidos de arriba: fuera
			// de ese flujo quedaba stale (linea de otra invocacion) o undefined.
			// Ahora se recalcula desde la linea real; la propia funcion ignora
			// las facturas de seguro.
			() => sync_outside_amounts_from_rate(frm, cdt, cdn),
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
			() => frappe.timeout(0.5),
			() => is_insurance_invoice(frm)
				? frm.events.item_table_update(frm, cdt, cdn)
				: sync_outside_amounts_from_rate(frm, cdt, cdn),
		]);
	},
	"qty": (frm, cdt, cdn) => {
		frappe.run_serially([
			() => frappe.timeout(0.3),
			() => frm.events.item_table_update(frm, cdt, cdn),
		]);
	},
	// El rate se teclea a mano en Alquiler/Proveedores/Clientes Privados. Antes
	// Alquiler quedaba fuera de las dos ramas (ni item_table_update ni el sync
	// de Proveedores), asi que cambiar el monto no movia la diferencia y el e-CF
	// salia por el importe viejo.
	"rate": (frm, cdt, cdn) => {
		frappe.run_serially([
			() => frappe.timeout(0.3),
			() => {
				if (!is_insurance_invoice(frm)) {
					return sync_outside_amounts_from_rate(frm, cdt, cdn);
				}
				// En seguros el Monto tambien se teclea a mano, pero todo el
				// calculo parte de la tarifa base: hay que rebasarla primero o
				// item_table_update recalcula sobre la tarifa vieja.
				rebase_insurance_line_from_rate(frm, cdt, cdn);
				return frm.events.item_table_update(frm, cdt, cdn);
			},
		]);
	},
	// Margen, descuento y precio de lista tambien mueven el rate y ninguno tenia
	// trigger: aplicar un margen dejaba la diferencia intacta. Se usa el sync
	// ligero (no item_table_update) para no reentrar en apply_copago_discount,
	// que a su vez escribe discount_amount/margin_rate_or_amount.
	"margin_rate_or_amount": (frm, cdt, cdn) => {
		frappe.run_serially([
			() => frappe.timeout(0.5),
			() => sync_outside_amounts_from_rate(frm, cdt, cdn),
		]);
	},
	"margin_type": (frm, cdt, cdn) => {
		frappe.run_serially([
			() => frappe.timeout(0.5),
			() => sync_outside_amounts_from_rate(frm, cdt, cdn),
		]);
	},
	"discount_amount": (frm, cdt, cdn) => {
		frappe.run_serially([
			() => frappe.timeout(0.5),
			() => sync_outside_amounts_from_rate(frm, cdt, cdn),
		]);
	},
	"price_list_rate": (frm, cdt, cdn) => {
		frappe.run_serially([
			() => frappe.timeout(0.5),
			() => sync_outside_amounts_from_rate(frm, cdt, cdn),
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
		// Se redondea a 2 decimales igual que en item_table_update: sin esto,
		// base - authorized_amount arrastra error de punto flotante (ej. 631 -
		// 536.35 = 94.6499999...) y un copago legitimo igual a la brecha (94.65)
		// se rechazaba por milesimas.
		const gross_difference = flt(base - flt(row.authorized_amount), 2);

		// Copago positivo: descuenta de la brecha total, no puede excederla.
		// Copago negativo: aumenta la diferencia neta (el rate sube), se permite.
		if (flt(row.copago, 2) > 0 && flt(row.copago, 2) > gross_difference) {
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

// print_qty (Cantidad Real ARS): fuera del grid; visible al expandir la linea
// en facturas de Proveedores, junto a los montos de la linea.
function toggle_proveedores_print_qty_field(frm) {
	const grid = frm.fields_dict.items && frm.fields_dict.items.grid;
	if (!grid) return;

	grid.update_docfield_property("print_qty", "in_list_view", 0);
	grid.update_docfield_property("print_qty", "hidden", 0);
}

// Fuera de las facturas de seguro, reclamado/autorizado/diferencia se derivan
// unicamente del rate vigente de la linea: el autorizado siempre es 0 y todo va
// a la diferencia (misma regla que api.update_sales_invoice y que
// sales_invoice._recalculate_outside_amounts en el servidor).
//
// difference_amount NO es informativo: alanube lo usa para armar el e-CF, asi
// que todo lo que mueva el rate -teclearlo, un margen, un descuento, el precio
// de lista- tiene que pasar por aqui o el e-CF sale por un monto distinto al de
// la factura. Es lo que le paso a FACT-170020.
//
// A proposito no toca discount_amount ni margin_rate_or_amount: si lo hiciera,
// reentraria en apply_copago_discount y en los triggers nativos de ERPNext.
function sync_outside_amounts_from_rate(frm, cdt, cdn) {
	// En seguros el rate es consecuencia del copago/cobertura y el calculo lo
	// hace item_table_update; aqui no se toca nada.
	if (is_insurance_invoice(frm)) return;

	// En devoluciones los montos se heredan de la factura original; el servidor
	// solo les pone el signo. Recalcularlos aqui desde el rate los devolveria a
	// positivo en cada render.
	if (frm.doc.is_return) {
		frm.trigger("refresh_outside_amounts");
		return;
	}

	const row = frappe.get_doc(cdt, cdn);
	if (!row || !row.item_code) return;

	const rate = flt(row.rate, 2);
	const apply_pct = aplicar_porciento(row);

	row.authorized_amount = 0;
	row.claimed_amount    = apply_pct ? rate : 0;
	row.difference_amount = flt(rate - flt(row.copago), 2);

	refresh_field("items");
	frm.trigger("refresh_outside_amounts");
}

function show_print_qty_in_item_detail(frm) {
	const grid_form = frappe.ui.form.get_open_grid_form();
	if (!grid_form || !grid_form.fields_dict.print_qty) return;

	const is_proveedor = frm.doc.tipo_de_factura === "Proveedores";
	grid_form.set_df_property("print_qty", "hidden", 0);
	grid_form.toggle_display("print_qty", is_proveedor);
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

// Monto (rate) que el calculo de seguros derivaria de la linea tal como esta:
// tarifa base menos el descuento por referido menos el copago. Es exactamente lo
// que apply_copago_discount deja en el rate, y sirve para distinguir un rate
// escrito por el usuario de uno que puso el propio calculo.
function insurance_derived_rate(row) {
	const base = get_base_rate(row);
	const referral_discount = (base * flt(row.__referral_pct)) / 100.0;
	return flt(base - referral_discount - flt(row.copago), 2);
}

// El Monto de una linea de seguro es un valor DERIVADO de la tarifa base
// (price_list_rate): autorizado = base x cobertura, diferencia = base -
// autorizado - copago, y el rate se arma restandole el copago a la base.
//
// Cuando el usuario teclea el Monto, ERPNext lo absorbe como discount_percentage
// sobre la tarifa vieja y nada mas cambia: autorizado y diferencia se quedaban
// en la tarifa anterior y apply_copago_discount devolvia el rate a su valor
// derivado (o al de la edicion anterior, si __referral_pct ya habia capturado un
// descuento manual previo). Asi se guardo FACT-170927: Monto 642 con autorizado
// 770.40 + diferencia 85.60 = 856, o sea reclamandole al seguro mas que el total
// de la linea, y pagos (3,852 + 428) por encima del grand total de 4,066.
//
// Aqui manda el Monto tecleado: pasa a ser la tarifa base de la linea y el resto
// del calculo se re-deriva desde ahi. El copago se sigue restando del Monto, por
// eso la base lo incluye. Un descuento por referido previo se descarta a
// proposito: el precio tecleado ya es el precio final negociado de la linea.
function rebase_insurance_line_from_rate(frm, cdt, cdn) {
	const row = frappe.get_doc(cdt, cdn);
	if (!row || !row.item_code) return false;

	// En devoluciones los montos se heredan de la factura original y el rate no
	// puede superar el de la factura; aqui no se rebasa nada.
	if (frm.doc.is_return) return false;

	const typed_rate = flt(row.rate, 2);
	if (!typed_rate) return false;

	// Sin cambio real: el rate lo puso el propio calculo (copago, cobertura,
	// lista de precios). Rebasar aqui movería la tarifa en cada vuelta.
	if (Math.abs(typed_rate - insurance_derived_rate(row)) < 0.005) return false;

	row.price_list_rate = flt(typed_rate + flt(row.copago), 2);
	// ERPNext ya reescribio estos campos con el descuento implicito de la
	// edicion manual (1 - rate/price_list_rate). Contra la tarifa nueva no
	// significan nada, y si sobreviven apply_copago_discount los vuelve a
	// aplicar sobre la base rebasada.
	row.__referral_pct = 0;
	row.discount_percentage = 0;
	row.discount_amount = 0;
	row.margin_type = "";
	row.margin_rate_or_amount = 0;
	row.rate_with_margin = 0;

	return true;
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

// ERPNext vuelve a distribuir los pagos POS cada vez que recalcula los totales.
// En una nota de crédito con varios medios de pago, esa redistribución concentra
// el monto en el método predeterminado y pierde el desglose de la factura origen.
// Rades ya crea esos pagos en negativo; aquí evitamos que el recálculo los pise.
(function preserve_pos_return_payment_distribution() {
	const taxes_and_totals = erpnext.taxes_and_totals && erpnext.taxes_and_totals.prototype;
	if (!taxes_and_totals || taxes_and_totals.__rades_preserves_return_payments) {
		return;
	}

	const set_default_payment = taxes_and_totals.set_total_amount_to_default_mop;
	taxes_and_totals.set_total_amount_to_default_mop = async function (...args) {
		const doc = this.frm && this.frm.doc;
		const payment_count = (doc && doc.payments ? doc.payments : []).filter(
			(payment) => Math.abs(flt(payment.amount)) > 0
		).length;

		if (
			doc &&
			doc.doctype === "Sales Invoice" &&
			doc.is_pos &&
			doc.is_return &&
			doc.return_against &&
			payment_count > 1
		) {
			return;
		}

		return set_default_payment.apply(this, args);
	};

	taxes_and_totals.__rades_preserves_return_payments = true;
})();
