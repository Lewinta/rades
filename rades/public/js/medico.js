frappe.ui.form.on("Medico", {
	telefono: (frm) => {
		frm.set_value("telefono", mask_phone(frm.doc.telefono))
	} 
})

function mask_phone(phone)
{
    temp = phone.trim().replace(/-/g,"")

    if (temp.length == 10)
        return ("({0}{1}{2}) {3}{4}{5}-{6}{7}{8}{9}".format(temp));
    else
        return phone;
}