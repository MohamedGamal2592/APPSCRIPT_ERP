# ERP Performance Optimization Strategy & Roadmap

## 📊 Executive Summary

This document provides a comprehensive technical strategy to dramatically accelerate page load times ("data withdrawal") and form submit/save cycles across the multi-company ERP system (**TopChemical**, **TopLight**, **ValleyFoods**).

---

## 🔍 Root Cause Analysis of Performance Bottlenecks

```
┌──────────────────────────────────────────────────────────────────────────┐
│                             PERFORMANCE BOTTLENECK MAP                   │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. Sheets API Overhead   │ ~400ms–1000ms per un-cached sheet read        │
│ 2. Payload Overhead       │ ~100KB shared HTML/CSS inlined per page load  │
│ 3. Full List Re-fetching  │ Re-fetching entire table after 1 row update   │
│ 4. Duplicate DOM Queries  │ Multi-pass form collection & validation       │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Tier 1: Immediate & High-Impact Optimizations (Low Risk)

### 1. Eliminate Post-Save Full List Re-fetching (Local Row Updates)
* **Problem:** After saving a modal form (e.g., editing a product or adding a customer), client scripts currently invoke `loadData()` / `loadList()`, triggering a complete server round-trip and re-rendering all table rows.
* **Solution:**
  - Leverage the return object from `add_action` / `edit_action` which contains the saved record.
  - Update or insert **only the affected `<tr>`** in the existing client-side table DOM.
  - Reserve `loadData()` full re-fetches strictly for initial page mount or explicit refresh buttons.
  - **Expected Win:** Reduces post-save response time from **2.5s → 200ms**.

### 2. Consolidate Shared Includes & Remove Code Duplication
* **Problem:** `UI_Components.html` (79 KB), `Client_Helpers.html` (16 KB), and `CSS_Tokens.html` (3 KB) are inlined into every page load via `include()`. Apps Script does not support HTTP caching (`Cache-Control`) for `HtmlService` output.
* **Solution:**
  - **Deduplicate `logout()`:** Replace 24+ copy-pasted `function logout()` implementations with the single global function in `Client_Helpers.html`.
  - **Deduplicate CSS:** Move repeated `<style>` rules (card layouts, badge styles, flex wrappers) into `CSS_Tokens.html` and delete duplicate rules from individual `.html` files.
  - **Single-pass Logo Builder:** Unify system and company logo markup generation in `UI_Components.html`.
  - **Expected Win:** Reduces initial HTML download size by **15–25 KB per page**.

### 3. Server-Side Data Memoization & Reference Caching
* **Problem:** Sub-helpers frequently re-read the same Google Sheet multiple times within a single execution (e.g., `computeNextEmpId_` reading `valley_employee_info` 3 times during a single `getEmployeesData_` call).
* **Solution:**
  - Extend request-scoped memoization (`_recordCache_`) to all sub-helper reads.
  - Utilize `CacheService` (60s–300s TTL) for hot reference data: `categories`, `chart_of_accounts`, `parties`, and `products`.
  - Automatically invalidate caches on mutating actions (`add_`, `edit_`, `delete_`) using `bumpVersion_()`.
  - **Expected Win:** Reduces server execution time per API call from **1200ms → 300ms**.

### 4. Optimize Form Collection & Prevent Duplicate Submits
* **Problem:** `UIC.collectForm()` and `UIC.validateForm()` query form elements in separate DOM passes.
* **Solution:**
  - Combine field collection and validation into a **single pass** over `form.elements`.
  - Enforce `UI.submitOnce(btn, fn)` across all form submit handlers to immediately disable the button and avoid duplicate submissions.
  - **Expected Win:** Instant visual feedback on button click and zero duplicate API calls.

---

## 🚀 Tier 2: Advanced Architectural Enhancements (Medium Term)

1. **Pre-aggregated Stock & Balance Ledgers:**
   - Instead of scanning thousands of transaction rows on every page load to compute current stock quantities or customer balances, maintain running balance summary rows in dedicated summary cells or sheets.

2. **Lazy Loading & Pagination:**
   - For historical lists (e.g., `top_light_sales_invoices`, `valley_attendance`), return the top 50 most recent records by default with server-side pagination / infinite scroll.

---

## 📁 Backup Archive Notice

All 98 active project source scripts (`.js` and `.html`) have been concatenated and backed up in the `Backup` folder:
- **Latest Versioned Backup:** `file:///d:/Work/Script/Backup/combined_20260831_221509.txt`
- **Latest Master Backup:** `file:///d:/Work/Script/Backup/combined_latest.txt`
- **Backup Script:** [`make_backup.ps1`](file:///d:/Work/Script/make_backup.ps1) (Updated to filter out temporary `.html` / `.bak` files).
