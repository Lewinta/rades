frappe.provide("rades.sinv");

$.extend(frappe.listview_settings["Sales Invoice"], {
	"post_render": function(list) {
		// Ocultar primero: el codigo de customer_group de abajo puede lanzar si
		// customer_group no es un standard filter, y no queremos que eso impida
		// ocultar "Nombre del Tercero".
		rades.sinv.hide_customer_name_standard_filter(list);

		var customer_group = list.page.fields_dict.customer_group;
		if (customer_group) {
			var options = customer_group.$input.children();

			if (options.length > 3) {
				customer_group.$input.empty();
				customer_group.$input.add_options(["Clientes", "Proveedores", "Alquiler"]);
			}
		}

		rades.sinv.set_customer_query(list);
	}
});

$.extend(rades.sinv, {
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
	},
	// customer_name (label "Nombre del Tercero") aparece como standard filter
	// porque es el title_field de Sales Invoice (el list view siempre muestra el
	// title_field como filtro, sin importar in_standard_filter). Como no queremos
	// cambiar el title_field (afectaria el titulo mostrado del documento),
	// ocultamos su control del area de filtros. Lo hacemos por DOM (data-fieldname)
	// para no depender de fields_dict.
	"hide_customer_name_standard_filter": function(list) {
		list.page.page_form
			.find('.frappe-control[data-fieldname="customer_name"]')
			.hide();

		var field = list.page.fields_dict.customer_name;
		if (field && field.$wrapper) {
			field.$wrapper.hide();
		}
	}
});