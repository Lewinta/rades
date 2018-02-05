$.extend(frappe.listview_settings['Customer'], {
	"post_render": function(list) {
		var options = list.page.fields_dict.customer_group.$input.children();

		if (options.length > 3) {
			list.page.fields_dict.customer_group.$input.empty();
			list.page.fields_dict.customer_group.$input.add_options(["Clientes", "Proveedores", "Alquiler"]);
		}
	}
});
