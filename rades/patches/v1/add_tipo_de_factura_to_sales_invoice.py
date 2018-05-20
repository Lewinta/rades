import frappe

def execute():
	if frappe.db.exists("Custom Field", "Sales Invoice-tipo_de_factura"):	return

	frappe.get_doc({
		'allow_on_submit': 0,
		'bold': 0,
		'collapsible': 0,
		'collapsible_depends_on': None,
		'columns': 0,
		'default': '',
		'depends_on': None,
		'description': None,
		'doctype': 'Custom Field',
		'dt': 'Sales Invoice',
		'fieldname': 'tipo_de_factura',
		'fieldtype': 'Select',
		'hidden': 0,
		'ignore_user_permissions': 0,
		'ignore_xss_filter': 0,
		'in_global_search': 0,
		'in_list_view': 1,
		'in_standard_filter': 0,
		'insert_after': 'main_sb',
		'label': 'Tipo de Factura',
		'modified_by': 'Administrator',
		'name': 'Sales Invoice-tipo_de_factura',
		'no_copy': 0,
		'options': '-\nClientes Privados\nClientes Seguros\nProveedores',
		'owner': 'Administrator',
		'permlevel': 0,
		'precision': '',
		'print_hide': 0,
		'print_hide_if_no_value': 0,
		'print_width': None,
		'read_only': 0,
		'report_hide': 0,
		'reqd': 1,
		'search_index': 0,
		'unique': 0,
		'width': None
	}).insert()
