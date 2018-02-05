frappe.ui.form.on("Account", {
   "refresh": function(frm) {
        if (frm.doc.account_number) {
            frm.toggle_enable("account_number", false);
        }
    }
});