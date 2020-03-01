frappe.ui.form.on("Bank Reconciliation", {
	add_clearance_date: frm => {
		// let selected = frm.fields_dict["payment_entries"].grid.get_selected();
		// $.map(selected, entry => {
		// 	frappe.model.set_value(dt, entry, "clearance_date", frm.doc.to_date);
		// });
		frm.trigger("delete_unselected");
	},
	delete_unselected: frm => {
		var tasks = [];
		let me = this;

		me.get_selected().forEach(function (docname) {
			tasks.push(function () {
				me.grid_rows_by_docname[docname].remove();
				dirty = true;
			});
			tasks.push(function () {
				return frappe.timeout(0.1);
			});
		});

		tasks.push(function () {
			if (dirty) me.refresh();
		});

		frappe.run_serially(tasks);
	}
});
