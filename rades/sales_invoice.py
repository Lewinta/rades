import frappe
import json
from frappe.model.naming import make_autoname

def autoname(self, event):
	self.name = make_autoname("FACT-.#####")
	if not self.ncf or self.is_return:
		self.ncf = make_autoname(self.naming_series)

def on_submit(self, event):
	for item in self.items:
		for name in (item.paid_sales_invoices or "").split(","):
			if not name: return

			doc = frappe.get_doc("Sales Invoice", name)
			# update payment_status [PAID|PARTIALLY PAID|UNPAID]
			doc.payment_status = "UNPAID" if self.get("is_return") else "PAID"

			doc.db_update()

	frappe.db.commit()

@frappe.whitelist()
def update_personal_info(self):
	data = json.loads(self) 
	inv = frappe.get_doc(data.get('doctype'), data.get('name'))
	cust = frappe.get_doc("Customer", inv.customer)
	inv.update({
		"nss": cust.nss,
		"tax_id": cust.tax_id,
		"ars": cust.ars
	})
	inv.db_update()
	frappe.db.commit()

def on_cancel(self, event):
	for item in self.items:
		for name in (item.paid_sales_invoices or "").split(","):
			if not name: return

			doc = frappe.get_doc("Sales Invoice", name)
			# update payment_status [PAID|PARTIALLY PAID|UNPAID]
			doc.payment_status = "PAID" if self.get("is_return") else "UNPAID"

			doc.db_update()

	frappe.db.commit()

