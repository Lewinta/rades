# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from . import __version__ as app_version

app_name = "rades"
app_title = "Rades"
app_publisher = "Lewin Villar"
app_description = "Aplicacion para centro de diagnostico"
app_icon = "fa fa-briefcase"
app_color = "#4aa3df"
app_email = "lewin.villar@gmail.com"
app_license = "MIT"

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
app_include_css = "/assets/rades/css/rades.css"
app_include_js = "/assets/rades/js/rades.js"

# include js, css files in header of web template
# web_include_css = "/assets/rades/css/rades.css"
# web_include_js = "/assets/rades/js/rades.js"

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
doctype_js = {
	"Customer" : "public/js/customer.js",
	"User" : "public/js/user.js",
	"Sales Invoice" : "public/js/sales_invoice.js",
	"Bank Reconciliation" : "public/js/bank_reconciliation.js",
}

doctype_list_js = {
	"Customer" : "public/js/customer_list.js",
	"Sales Invoice" : "public/js/sales_invoice_list.js",
	"Medico" : "public/js/medico.js",
	"Account" : "public/js/account.js",
	"Custom Script" : "public/js/custom_script.js",
	"Item" : "public/js/item.js",
	"Supplier" : "public/js/supplier.js"

}

# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Home Pages
# ----------

# Only customizations identical on every site running this app (csrd, rades).
# Site-specific Custom Fields/Property Setters and all Custom DocPerm live in
# each site's DB and are snapshotted in rades/site_customizations/<site>/
# (branding_tz.site_snapshot); exporting them here made migrate overwrite one
# site with the other's customizations.
fixtures = [
	{
		"doctype": "Custom Field",
		"filters": {
			"name": ("in", (
				"Journal Entry Account-mode_of_payment",
				"Mode of Payment-column_break_zxvaa",
				"Mode of Payment-dgii_payment_type",
				"Mode of Payment-section_break_39mpw",
				"Payment Entry Reference-isr_amount",
				"Payment Entry Reference-isr_category",
				"Payment Entry Reference-retention_amount",
				"Payment Entry Reference-retention_type",
				"Purchase Invoice-column_break_186",
				"Purchase Invoice-dgii_deferred_response_json",
				"Purchase Invoice-dgii_response_display",
				"Purchase Invoice-dgii_response_id",
				"Purchase Invoice-dgii_response_json",
				"Purchase Invoice-document_stamp_url",
				"Purchase Invoice-generate_ncf",
				"Purchase Invoice-legal_status",
				"Purchase Invoice-regenerate_ncf",
				"Purchase Invoice-security_code",
				"Purchase Invoice-sequence_consumed",
				"Purchase Invoice-signature_date",
				"Purchase Invoice-tracking_id",
				"Purchase Invoice-vencimiento_ncf",
				"Purchase Invoice-view_online",
				"Sales Invoice Item-item_type",
				"Sales Invoice-custom_column_break_396kv",
				"Sales Invoice-custom_encf",
				"Sales Invoice-document_stamp_url",
				"UOM-abbr",
				"UOM-code",
				"UOM-column_break_ttlr2",
				"UOM-column_break_vdpnj",
			))
		}
	},
	{
		"doctype": "Property Setter",
		"filters": {
			"name": ("in", (
				"Custom Field-module-default",
				"Customer-customer_name-translatable",
				"Customer-main-quick_entry",
				"Customer-main-show_title_field_in_link",
				"Customer-tax_id-label",
				"Delivery Note-tax_id-hidden",
				"Delivery Note-tax_id-print_hide",
				"Item Default-company-in_list_view",
				"Item Default-default_price_list-in_list_view",
				"Item Default-default_warehouse-in_list_view",
				"Item Default-expense_account-in_list_view",
				"Item Default-income_account-in_list_view",
				"Item Price-main-field_order",
				"Item-description-translatable",
				"Item-item_name-translatable",
				"Item-main-field_order",
				"Landed Cost Taxes and Charges-amount-columns",
				"Landed Cost Taxes and Charges-amount-default",
				"Landed Cost Taxes and Charges-amount-read_only",
				"Landed Cost Taxes and Charges-description-in_list_view",
				"Landed Cost Taxes and Charges-description-reqd",
				"Landed Cost Taxes and Charges-invoice-no_copy",
				"Landed Cost Taxes and Charges-main-editable_grid",
				"Landed Cost Taxes and Charges-main-read_only_onload",
				"Landed Cost Taxes and Charges-supplier_invoice-no_copy",
				"Landed Cost Taxes and Charges-transaction_group-width",
				"Packed Item-rate-read_only",
				"Print Format-module-default",
				"Property Setter-module-default",
				"Purchase Invoice-base_rounded_total-hidden",
				"Purchase Invoice-base_rounded_total-print_hide",
				"Purchase Invoice-bill_no-in_standard_filter",
				"Purchase Invoice-bill_no-label",
				"Purchase Invoice-cost_center-in_standard_filter",
				"Purchase Invoice-cost_center-reqd",
				"Purchase Invoice-due_date-print_hide",
				"Purchase Invoice-in_words-hidden",
				"Purchase Invoice-in_words-print_hide",
				"Purchase Invoice-naming_series-options",
				"Purchase Invoice-payment_schedule-print_hide",
				"Purchase Invoice-posting_date-default",
				"Purchase Invoice-remarks-reqd",
				"Purchase Invoice-rounded_total-hidden",
				"Purchase Invoice-rounded_total-print_hide",
				"Purchase Invoice-set_posting_time-default",
				"Purchase Receipt-provisional_expense_account-hidden",
				"Sales Invoice Item-authorized_amount-precision",
				"Sales Invoice Item-claimed_amount-precision",
				"Sales Invoice Item-difference_amount-precision",
				"Sales Invoice Item-discount_account-hidden",
				"Sales Invoice Item-discount_account-mandatory_depends_on",
				"Sales Invoice-accounting_dimensions_section-hidden",
				"Sales Invoice-additional_discount_account-hidden",
				"Sales Invoice-additional_discount_account-mandatory_depends_on",
				"Sales Invoice-additional_discount_section-depends_on",
				"Sales Invoice-apply_tds-hidden",
				"Sales Invoice-company_tax_id-hidden",
				"Sales Invoice-disable_rounded_total-default",
				"Sales Invoice-disable_rounded_total-hidden",
				"Sales Invoice-is_debit_note-hidden",
				"Sales Invoice-items_section-collapsible_depends_on",
				"Sales Invoice-items_section-hidden",
				"Sales Invoice-main_sb-collapsible",
				"Sales Invoice-naming_series-description",
				"Sales Invoice-naming_series-hidden",
				"Sales Invoice-ncf-depends_on",
				"Sales Invoice-ncf-mandatory_depends_on",
				"Sales Invoice-payments_section-collapsible",
				"Sales Invoice-payments_section-collapsible_depends_on",
				"Sales Invoice-payments_section-depends_on",
				"Sales Invoice-pos_profile-hidden",
				"Sales Invoice-pricing_rule_details-hidden",
				"Sales Invoice-return_against_ncf-depends_on",
				"Sales Invoice-sec_tax_breakup-hidden",
				"Sales Invoice-section_break_sgnf-hidden",
				"Sales Invoice-tax_category-reqd",
				"Sales Invoice-tax_id-hidden",
				"Sales Invoice-tax_id-print_hide",
				"Sales Invoice-tipo_de_factura-default",
				"Sales Invoice-tipo_de_factura-fieldtype",
				"Sales Invoice-tipo_de_factura-hidden",
				"Sales Invoice-tipo_de_factura-read_only",
				"Sales Invoice-tipo_de_factura-width",
				"Sales Invoice-total_qty-hidden",
				"Sales Invoice-totals_section-depends_on",
				"Sales Invoice-use_company_roundoff_cost_center-default",
				"Sales Invoice-use_company_roundoff_cost_center-hidden",
				"Sales Order-tax_id-hidden",
				"Sales Order-tax_id-print_hide",
				"Supplier-main-quick_entry",
				"Supplier-naming_series-hidden",
				"Supplier-naming_series-reqd",
				"Supplier-pan-hidden",
				"Supplier-tax_id-in_list_view",
				"Supplier-tax_id-in_standard_filter",
			))
		}
	},
]

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
#	"Role": "home_page"
# }

# Website user home page (by function)
# get_website_user_home_page = "rades.utils.get_home_page"

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Installation
# ------------

# before_install = "rades.install.before_install"
# after_install = "rades.install.after_install"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "rades.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
	"Sales Invoice": {
		"autoname": "rades.sales_invoice.autoname",
		"before_validate": "rades.sales_invoice.before_validate",
		"validate": "rades.sales_invoice.validate",
		"before_cancel": "rades.sales_invoice.before_cancel",
		"on_submit": "rades.sales_invoice.on_submit",
		"on_update_after_submit": "rades.sales_invoice.on_update_after_submit",
		"on_cancel": "rades.sales_invoice.on_cancel",
	},
	"Customer": {
		"validate": "rades.customer.validate",
		"after_insert": "rades.customer.after_insert",
		"on_update": "rades.customer.on_update",
		"on_trash": "rades.customer.on_trash"
	}
}

scheduler_events = {
	"daily": [
		"rades.backup.daily"
	],
	"hourly": [
		"rades.nginx.hourly"
	]
}
# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"rades.tasks.all"
# 	],
# 	"daily": [
# 		"rades.tasks.daily"
# 	],
# 	"hourly": [
# 		"rades.tasks.hourly"
# 	],
# 	"weekly": [
# 		"rades.tasks.weekly"
# 	]
# 	"monthly": [
# 		"rades.tasks.monthly"
# 	]
# }

# Testing
# -------

# before_tests = "rades.install.before_tests"

# Overriding Whitelisted Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "rades.event.get_events"
# }

boot_session = "rades.boot.boot_session"