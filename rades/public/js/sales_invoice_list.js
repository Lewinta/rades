frappe.provide("rades.sinv");

$.extend(frappe.listview_settings["Sales Invoice"], {
	// OJO: el list view de Frappe NO invoca "post_render" (solo existe en form/treeview).
	// El hook correcto que recibe el listview es "onload".
	"onload": function(list) {
		rades.sinv.hide_customer_name_standard_filter(list);
		rades.sinv.limit_customer_group_options(list);
		rades.sinv.set_customer_query(list);
	}
});

$.extend(rades.sinv, {
	// customer_name (label "Nombre del Tercero") es el title_field de Sales Invoice,
	// y el list view SIEMPRE muestra el title_field como standard filter, sin importar
	// in_standard_filter (base_list.js: df.fieldname === title_field || df.in_standard_filter).
	// No queremos cambiar el title_field (cambiaria el titulo mostrado del documento),
	// asi que ocultamos su control de filtro con CSS: es independiente del momento en que
	// Frappe (re)renderiza el control.
	"hide_customer_name_standard_filter": function(list) {
		var style_id = "rades-hide-sinv-customer-name-filter";
		if (document.getElementById(style_id)) return;

		$(
			"<style id='" + style_id + "'>" +
			'.page-form .frappe-control[data-fieldname="customer_name"]{display:none !important;}' +
			"</style>"
		).appendTo("head");
	},

	"limit_customer_group_options": function(list) {
		var cg = list.page.fields_dict.customer_group;
		if (!cg || !cg.$input) return;

		var options = cg.$input.children();
		if (options.length > 3) {
			cg.$input.empty();
			cg.$input.add_options(["Clientes", "Proveedores", "Alquiler"]);
		}
	},

	"set_customer_query": function(list) {
		var customer_field = list.page.fields_dict.customer;
		if (!customer_field) return;

		var customer_group = list.page.fields_dict.customer_group
			? list.page.fields_dict.customer_group.value
			: null;

		customer_field.df.get_query = function() {
			return {
				"query": "rades.queries.customer_query",
				"filters": {
					"customer_group": customer_group || "Clientes"
				}
			}
		}
	}
});
