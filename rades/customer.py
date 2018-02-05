import frappe

def after_insert(self, event):
	if not self.customer_group == "Proveedores" or\
		frappe.db.exists("Price List", self.name):
		return 0 # exit code is zero

	pricls = frappe.new_doc("Price List")

	pricls.update({
		"selling": 1,
		"currency": "DOP",
		"doctype": "Price List",
		"enabled": 1,
		"price_list_name": self.name
	})

	pricls.append("countries", {
		"country": u"Rep\xfablica Dominicana"
	})

	pricls.save()

def on_trash(self, event):
	frappe.delete_doc_if_exists("Price List", self.name)
	frappe.db.commit()