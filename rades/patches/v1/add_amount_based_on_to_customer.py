import frappe

def execute():
	if frappe.db.exists("Custom Field", "Customer-amount_based_on"):	return
	
	frappe.get_doc({
		'allow_on_submit': 0,
		'bold': 0,
		'collapsible': 0,
		'collapsible_depends_on': None,
		'columns': 0,
		'default': None,
		'depends_on': 'eval:doc.customer_group=="Proveedores"',
		'description': None,
		'doctype': 'Custom Field',
		'dt': 'Customer',
		'fieldname': 'amount_based_on',
		'fieldtype': 'Select',
		'hidden': 0,
		'ignore_user_permissions': 0,
		'ignore_xss_filter': 0,
		'in_global_search': 0,
		'in_list_view': 0,
		'in_standard_filter': 0,
		'insert_after': 'customer_group',
		'label': 'Amount Based On',
		'no_copy': 0,
		'options': 'Authorized Amount\nDifference Amount',
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
