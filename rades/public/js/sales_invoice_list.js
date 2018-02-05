frappe.provide("rades.sinv");

$.extend(frappe.listview_settings["Sales Invoice"], {
	"post_render": function(list) {
		var options = list.page.fields_dict.customer_group.$input.children();

		if (options.length > 3) {
			list.page.fields_dict.customer_group.$input.empty();
			list.page.fields_dict.customer_group.$input.add_options(["Clientes", "Proveedores", "Alquiler"]);
		}

		rades.sinv.set_customer_query(list);
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
	}
});