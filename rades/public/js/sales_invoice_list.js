frappe.provide("rades.sinv");

$.extend(frappe.listview_settings["Sales Invoice"], {
	"post_render": function(list) {
		var options = list.page.fields_dict.customer_group.$input.children();

		if (options.length > 3) {
			list.page.fields_dict.customer_group.$input.empty();
			list.page.fields_dict.customer_group.$input.add_options(["Clientes", "Proveedores", "Alquiler"]);
		}

		rades.sinv.set_customer_query(list);
		rades.sinv.hide_customer_name_standard_filter(list);
	}
});

$.extend(rades.sinv, {
	"set_customer_query": function(list) {
		var customer_group = list.page.fields_dict.customer_group.value;

		list.page.fields_dict.customer.df.get_query = function() {
			return {
				"query": "rades.queries.customer_query",
				"filters": {
					"customer_group": customer_group || "Clientes"
				}
			}
		}
	},
	// customer_name (label "Nombre del Tercero") aparece como standard filter
	// porque es el title_field de Sales Invoice (el list view siempre muestra el
	// title_field como filtro, sin importar in_standard_filter). Como no queremos
	// cambiar el title_field (afectaria el titulo mostrado del documento),
	// ocultamos su control del area de filtros.
	"hide_customer_name_standard_filter": function(list) {
		var field = list.page.fields_dict.customer_name;
		if (field && field.$wrapper) {
			field.$wrapper.hide();
		}
	}
});