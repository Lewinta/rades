// Copyright (c) 2018, Lewin Villar and contributors
// For license information, please see license.txt

frappe.ui.form.on('Centro de Salud', {
	telefono: (frm) => frm.set_value("telefono", mask_phone(frm.doc.telefono)),
	nombre: (frm) => frm.set_value("nombre", frm.doc.nombre.trim().toUpperCase()),



});

function mask_phone(phone)
{
    temp = phone.trim().replace(/-/g,"")

    if (temp.length == 10)
        return ("({0}{1}{2}) {3}{4}{5}-{6}{7}{8}{9}".format(temp));
    else
        return phone;

    /*var pattern = new RegExp("((^[0-9]{3})[0-9]{3}[0-9]{4})$");
    var pattern1 = new RegExp("([(][0-9]{3}[)] [0-9]{3}-[0-9]{4})$");
    var pattern2 = new RegExp("([(][0-9]{3}[)][0-9]{3}-[0-9]{4})$");

    if(pattern.test(phone))
        return ("({0}{1}{2}) {3}{4}{5}-{6}{7}{8}{9}".format(phone));
    else if(pattern1.test(phone))
        return phone;
    else if(pattern2.test(phone))
        return ("{0}{1}{2}{3}{4} {5}{6}{7}{8}{9}{10}{11}{12}".format(phone));*/
}