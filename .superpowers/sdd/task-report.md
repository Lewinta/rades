# Task Report: ARS Filter for Registro de Ventas

## Files Changed

### Task 1 (Backend)
- `rades/rades/report/registro_de_ventas/registro_de_ventas.py` — Split `get_data` into `get_data` (one-liner delegating to `get_query`) and new `get_query` function with `if filters.get("ars")` condition added.
- `rades/test_registro_de_ventas.py` — Created new unittest file with three tests exercising `get_query` SQL generation with/without ARS filter.

### Task 2 (Frontend)
- `rades/rades/report/registro_de_ventas/registro_de_ventas.js` — Added `on_change` method to `tipo_de_factura` filter (shows/hides ARS filter and calls `frappe.query_report.refresh()`); added new `ars` filter object (Link → Customer, hidden: 1) as last element of the filters array.

## Commits

- `b17d1c4` feat(registro-de-ventas): filtrar por ARS en backend + seam get_query testeable
- `c21e18d` feat(registro-de-ventas): filtro ARS visible solo con tipo_de_factura=Clientes Seguros

## Notes

- No bench commands were run (no `bench migrate`, `bench build`, `bench run-tests`, or any other bench command).
- IDE emitted TypeScript hints about `frappe.query_report` (code 2568) — these are false positives from incomplete Frappe type stubs; `frappe.query_report` is the correct Frappe runtime API for the active report page.
