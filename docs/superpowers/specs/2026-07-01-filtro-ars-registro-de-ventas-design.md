# Filtro por ARS en el reporte "Registro de Ventas"

- **Fecha:** 2026-07-01
- **App:** rades
- **Site de trabajo:** csrd.tzcode.tech
- **Reporte:** `Registro de Ventas` (Script Report, `ref_doctype = Sales Invoice`)

## Objetivo

Agregar un filtro por **ARS** al reporte `Registro de Ventas`. El filtro debe ser
**visible únicamente cuando el filtro `tipo_de_factura = "Clientes Seguros"`**. En
cualquier otro caso el filtro debe ocultarse y su valor debe limpiarse para que no
afecte el resultado de forma silenciosa.

## Contexto

Archivos involucrados:

- `apps/rades/rades/rades/report/registro_de_ventas/registro_de_ventas.js`
- `apps/rades/rades/rades/report/registro_de_ventas/registro_de_ventas.py`

Estado actual:

- Filtros existentes: `from_date`, `to_date`, `tipo_de_factura`
  (Select: `""`, `Clientes Privados`, `Clientes Seguros`, `Alquiler`, `Proveedores`; default `""`).
- El campo **ARS** no es un DocType propio: es un campo **Link → Customer** (custom field)
  en Sales Invoice, de solo lectura, heredado del cliente. En la BD la factura almacena
  el ARS en la columna `ars`.
- El reporte ya emite una columna `ars` en su salida; **no** se modifican columnas.
- El backend ya filtra por `tipo_de_factura`:
  ```python
  if filters.get("tipo_de_factura"):
      query = query.where(si.tipo_de_factura == filters.tipo_de_factura)
  ```

## Decisiones de diseño

1. **Tipo de filtro:** `Link` con `options: "Customer"` — refleja exactamente cómo se
   almacena el ARS en la factura. (Descartado: lista fija Select, y Link restringido a
   solo-ARS por no aportar valor suficiente frente a la complejidad).
2. **Al ocultarse:** se **limpia** el valor seleccionado (evita filtrado invisible).
   (Descartado: conservar el valor oculto).
3. **Visibilidad condicional:** patrón `on_change` + `toggle`/`set_value` en JS, en lugar
   de `depends_on`, porque es el único que permite limpiar el valor al ocultar.

## Cambios

### 1. JS — nuevo filtro `ars`

En el array `filters` de `registro_de_ventas.js`, agregar:

```js
{
    fieldname: "ars",
    label: __("ARS"),
    fieldtype: "Link",
    options: "Customer",
    hidden: 1, // oculto por defecto: tipo_de_factura arranca en ""
}
```

### 2. JS — visibilidad condicional vía `on_change` en `tipo_de_factura`

Agregar al filtro `tipo_de_factura` un callback `on_change`:

```js
on_change() {
    const tipo = frappe.query_report.get_filter_value("tipo_de_factura");
    const ars_filter = frappe.query_report.get_filter("ars");
    if (tipo === "Clientes Seguros") {
        ars_filter.toggle(true);
    } else {
        ars_filter.set_value("");
        ars_filter.toggle(false);
    }
    frappe.query_report.refresh();
}
```

Notas:
- Como el default de `tipo_de_factura` es `""`, el filtro ARS nace oculto (`hidden: 1`),
  por lo que no hace falta lógica de inicialización adicional.
- `set_value("")` antes de `toggle(false)` garantiza que no quede un valor colgado que
  filtre sin ser visible.

### 3. Python — aplicar el filtro en `get_data`

En `registro_de_ventas.py`, junto al filtro de `tipo_de_factura`:

```python
if filters.get("ars"):
    query = query.where(si.ars == filters.ars)
```

Se aplica solo si viene un valor. Como el JS limpia el valor cuando `tipo_de_factura`
no es `"Clientes Seguros"`, el backend no filtra silenciosamente.

## Fuera de alcance

- No se modifican las columnas del reporte (la columna `ars` ya existe).
- No se modifica el campo/custom field ARS del DocType Sales Invoice ni Customer.
- No se introduce lista fija de ARS.

## Verificación

Este bench no es un repositorio git, por lo que la validación es funcional en
`csrd.tzcode.tech`:

1. Abrir el reporte `Registro de Ventas`.
2. Con `tipo_de_factura` vacío o distinto de "Clientes Seguros": el filtro ARS **no** aparece.
3. Seleccionar `tipo_de_factura = "Clientes Seguros"`: el filtro ARS **aparece**.
4. Elegir un ARS y confirmar que la tabla se filtra por ese ARS.
5. Cambiar `tipo_de_factura` a otro valor: el filtro ARS se **oculta** y su valor se **limpia**
   (los resultados dejan de estar filtrados por ARS).
