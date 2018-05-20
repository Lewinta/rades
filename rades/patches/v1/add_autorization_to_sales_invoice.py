import frappe

def execute():
	if frappe.db.exists("Custom Field", "Sales Invoice-autorization"):	return
	
	frappe.get_doc({
		'allow_on_submit': 0,
		'bold': 0,
		'collapsible': 0,
		'collapsible_depends_on': None,
		'columns': 0,
		'default': '',
		'depends_on': 'eval:doc.tipo_de_factura == "Clientes Seguros"||(doc.tipo_de_factura=="Servimerd"&&doc.ars&&doc.nss)',
		'description': None,
		'doctype': 'Custom Field',
		'dt': 'Sales Invoice',
		'fieldname': 'autorization',
		'fieldtype': 'Data',
		'hidden': 0,
		'ignore_user_permissions': 0,
		'ignore_xss_filter': 0,
		'in_global_search': 0,
		'in_list_view': 0,
		'in_standard_filter': 0,
		'insert_after': 'cb45',
		'label': 'Autorizacion',
		'no_copy': 0,
		'options': None,
		'permlevel': 0,
		'precision': '',
		'print_hide': 0,
		'print_hide_if_no_value': 0,
		'print_width': None,
		'read_only': 0,
		'report_hide': 0,
		'reqd': 0,
		'search_index': 0,
		'unique': 0,
		'width': None
	}).insert()
