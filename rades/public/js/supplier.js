frappe.ui.form.on('Supplier', {
    refresh: function(frm) {
        frm.set_df_property('tipo_rnc', 'options', [
            { "value": "1", "label": "RNC" },
            { "value": "2", "label": "CEDULA" },
        ])
    },
    tax_id: function(frm) {
    	frm.set_value("tax_id", mask_ced_pas_rnc(frm.doc.tax_id))
    }
});