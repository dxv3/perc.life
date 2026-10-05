// ---- Roblox overlay: DevEx, marketplace tax and black market calculators ----
(() => {
    if (!document.getElementById("t-devexRobux")) return;

    // ---- DevEx calculator: Robux <-> cash, USD rates converted via ECB FX (frankfurter) ----
    const DEVEX_RATES = {
        standard: { usd: 0.0038, label: "Standard" },
        legacy: { usd: 0.0035, label: "Legacy (earned before 5 Sep 2025)" },
        us18: { usd: 0.0054, label: "US 18+" }
    };
    const DEVEX_MIN = 30000;
    // fallback until live rates load (approx. USD -> currency)
    const fx = {
        USD: 1, GBP: 0.754, EUR: 0.881, CAD: 1.417, AUD: 1.432, BRL: 5.4, JPY: 148, MXN: 18.5,
        INR: 88, PHP: 57, IDR: 16400, TRY: 41, PLN: 3.7, SEK: 9.5, NOK: 10.1, DKK: 6.4,
        CHF: 0.8, NZD: 1.7, SGD: 1.29, HKD: 7.8, KRW: 1390, ZAR: 17.5, MYR: 4.2, THB: 32.5
    };
    const FX_URL = "https://api.frankfurter.dev/v2/rates?base=USD&quotes=" + Object.keys(fx).filter(c => c !== "USD").join(",");
    // Wise balance-to-balance conversion fee from USD (% of amount, no flat fee), from wise.com pricing
    const WISE_FEE_PCT = { USD: 0, GBP: 0.33, EUR: 0.29, CAD: 0.28, AUD: 0.28 };
    let fxDate = null;
    let fxPromise = null;
    let devexRate = "standard";
    let devexLastEdited = "robux";

    const robuxIn = document.getElementById("t-devexRobux");
    const cashIn = document.getElementById("t-devexCash");
    const currencySel = document.getElementById("t-devexCurrency");
    const wiseIn = document.getElementById("t-devexWise");
    const shareWrap = document.getElementById("t-devexShareWrap");
    const shareIn = document.getElementById("t-devexShare");
    try { const saved = localStorage.getItem("devex18Share"); if (saved != null) shareIn.value = saved; } catch (e) {}
    const money = (n, cur) => new Intl.NumberFormat("en-GB", { style: "currency", currency: cur, currencyDisplay: "narrowSymbol" }).format(n);

    function loadFx() {
        if (fxPromise) return fxPromise;
        fxPromise = fetch(FX_URL)
            .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
            .then(rows => rows.forEach(row => { fx[row.quote] = row.rate; fxDate = row.date; }))
            .catch(err => console.error("fx load failed", err))
            .finally(() => { updateDevex(); updateBlackMarket(); });
        return fxPromise;
    }

    // % of Robux earned at the US 18+ rate; the rest cashes out at the standard rate
    function us18Share() {
        return Math.min(100, Math.max(0, Number(shareIn.value) || 0));
    }

    function devexUsdPerRobux() {
        if (devexRate !== "us18") return DEVEX_RATES[devexRate].usd;
        const p = us18Share() / 100;
        return DEVEX_RATES.us18.usd * p + DEVEX_RATES.standard.usd * (1 - p);
    }

    function updateDevex() {
        const usdPerRobux = devexUsdPerRobux();
        const cur = currencySel.value;
        const feePct = wiseIn.checked ? WISE_FEE_PCT[cur] : 0;
        // effective local currency per USD after the Wise conversion fee
        const rate = fx[cur] * (1 - feePct / 100);

        if (devexLastEdited === "robux") {
            const robux = Math.max(0, Math.floor(Number(robuxIn.value) || 0));
            cashIn.value = robux ? (robux * usdPerRobux * rate).toFixed(2) : "";
        } else {
            const cash = Math.max(0, Number(cashIn.value) || 0);
            robuxIn.value = cash ? Math.ceil(cash / rate / usdPerRobux) : "";
        }

        const robux = Math.max(0, Math.floor(Number(robuxIn.value) || 0));
        const usd = robux * usdPerRobux;
        const tiles = [
            { label: "Payout", value: money(usd * rate, cur) },
            { label: "In USD", value: money(usd, "USD") }
        ];
        if (feePct) tiles.push({ label: "Wise Fee (" + feePct + "%)", value: money(usd * fx[cur] * feePct / 100, cur) });
        document.getElementById("t-devexResult").innerHTML = tiles.map(t => `<div class="devex-tile">
            <div class="label">${t.label}</div>
            <div class="value">${t.value}</div>
        </div>`).join("");

        const note = document.getElementById("t-devexNote");
        const fxText = cur === "USD" ? "" : " · 1 USD = " + fx[cur].toFixed(4) + " " + cur + (fxDate ? " (ECB, " + fxDate + ")" : " (approx.)")
            + (feePct ? " minus " + feePct + "% Wise fee" : "");
        const warn = robux > 0 && robux < DEVEX_MIN
            ? `<span class="warn">below the ${DEVEX_MIN.toLocaleString("en-GB")} Robux minimum to cash out</span> · `
            : "";
        const rateText = devexRate === "us18" && us18Share() < 100
            ? us18Share() + "% at US 18+ $" + DEVEX_RATES.us18.usd + ", rest at standard $" + DEVEX_RATES.standard.usd + " = $" + +usdPerRobux.toFixed(6) + "/Robux"
            : DEVEX_RATES[devexRate].label + " rate $" + usdPerRobux + "/Robux";
        note.innerHTML = warn + rateText + fxText + " · before any tax";
    }

    robuxIn.addEventListener("input", () => { devexLastEdited = "robux"; updateDevex(); });
    cashIn.addEventListener("input", () => { devexLastEdited = "cash"; updateDevex(); });
    currencySel.addEventListener("change", updateDevex);
    wiseIn.addEventListener("change", updateDevex);
    shareIn.addEventListener("input", () => {
        try { localStorage.setItem("devex18Share", shareIn.value); } catch (e) {}
        updateDevex();
    });
    document.querySelectorAll("#t-devexRates .range-pill").forEach(btn => {
        btn.addEventListener("click", () => {
            devexRate = btn.dataset.rate;
            shareWrap.hidden = devexRate !== "us18";
            document.querySelectorAll("#t-devexRates .range-pill").forEach(b => b.classList.toggle("active", b === btn));
            updateDevex();
        });
    });
    updateDevex();

    // ---- Marketplace tax: sellers keep 70% of the price, rounded down ----
    const TAX_KEEP = 0.7;
    const taxPriceIn = document.getElementById("t-taxPrice");
    const taxNetIn = document.getElementById("t-taxNet");
    let taxLastEdited = "price";
    // Roblox Plus: subscribers pay 10% less (20% from their third month). Roblox covers it, so the seller's cut is unchanged
    let plusDiscount = 20;
    try { const saved = localStorage.getItem("plusDiscount"); if (["0", "10", "20"].includes(saved)) plusDiscount = Number(saved); } catch (e) {}
    const plusPrice = price => Math.round(price * (1 - plusDiscount / 100));
    const rbx = n => Math.round(n).toLocaleString("en-GB") + " R$";
    const netOf = price => Math.floor(price * TAX_KEEP);
    const priceFor = net => {
        let p = Math.ceil(net / TAX_KEEP);
        while (p > 0 && netOf(p - 1) >= net) p--;
        while (netOf(p) < net) p++;
        return p;
    };

    function updateTax() {
        if (taxLastEdited === "price") {
            const price = Math.max(0, Math.floor(Number(taxPriceIn.value) || 0));
            taxNetIn.value = price ? netOf(price) : "";
        } else {
            const net = Math.max(0, Math.floor(Number(taxNetIn.value) || 0));
            taxPriceIn.value = net ? priceFor(net) : "";
        }
        const price = Math.max(0, Math.floor(Number(taxPriceIn.value) || 0));
        const net = netOf(price);
        const tiles = [
            { label: "You Receive", value: rbx(net) },
            { label: "Roblox Takes", value: rbx(price - net) }
        ];
        if (plusDiscount) {
            tiles.push({ label: "Plus Buyer Pays", value: rbx(plusPrice(price)) });
            tiles.push({ label: "List Price", value: rbx(price) });
        } else {
            tiles.push({ label: "Buyer Pays", value: rbx(price) });
        }
        document.getElementById("t-taxResult").innerHTML = tiles.map(t => `<div class="devex-tile"><div class="label">${t.label}</div><div class="value">${t.value}</div></div>`).join("");
        const plusCol = n => plusDiscount ? `<span class="plus">${rbx(plusPrice(priceFor(n)))}</span>` : "";
        document.getElementById("t-taxTable").innerHTML = '<div class="tax-row head"><span>To receive</span><span>Set price to'
            + (plusDiscount ? " · Plus pays" : "") + '</span></div>'
            + [100, 500, 1000, 2500, 5000, 10000, 25000, 100000].map(n => `<button class="tax-row" data-net="${n}"><span>${rbx(n)}</span><span>${rbx(priceFor(n))}${plusCol(n)}</span></button>`).join("");
        document.getElementById("t-taxNote").textContent = "30% marketplace fee on game passes, dev products and items · earnings are rounded down · pending for a few days before they land"
            + (plusDiscount ? " · Roblox Plus subscribers get " + plusDiscount + "% off (10% at first, 20% from their third month); Roblox covers the discount, so you earn the same · Plus price rounded to the nearest Robux" : "");
    }
    const plusPills = document.querySelectorAll("#t-plusDiscount .range-pill");
    const syncPlusPills = () => plusPills.forEach(b => b.classList.toggle("active", Number(b.dataset.discount) === plusDiscount));
    plusPills.forEach(btn => btn.addEventListener("click", () => {
        plusDiscount = Number(btn.dataset.discount);
        try { localStorage.setItem("plusDiscount", String(plusDiscount)); } catch (e) {}
        syncPlusPills();
        updateTax();
    }));
    syncPlusPills();
    taxPriceIn.addEventListener("input", () => { taxLastEdited = "price"; updateTax(); });
    taxNetIn.addEventListener("input", () => { taxLastEdited = "net"; updateTax(); });
    document.getElementById("t-taxTable").addEventListener("click", e => {
        const row = e.target.closest("[data-net]");
        if (!row) return;
        taxNetIn.value = row.dataset.net;
        taxLastEdited = "net";
        updateTax();
    });
    updateTax();

    // ---- Black market check: what a Robux deal is worth vs cashing out through DevEx ----
    const bmRobuxIn = document.getElementById("t-bmRobux");
    const bmPriceIn = document.getElementById("t-bmPrice");
    const bmCurrencySel = document.getElementById("t-bmCurrency");
    bmCurrencySel.innerHTML = Object.keys(fx).map(c => `<option value="${c}">${c}</option>`).join("");
    let bmPrices = {};
    try { bmPrices = JSON.parse(localStorage.getItem("bmPrices") || "{}") || {}; } catch (e) {}
    try { bmCurrencySel.value = localStorage.getItem("bmCurrency") || "GBP"; } catch (e) { bmCurrencySel.value = "GBP"; }
    if (!bmCurrencySel.value) bmCurrencySel.value = "GBP";
    bmPriceIn.value = bmPrices[bmCurrencySel.value] != null ? bmPrices[bmCurrencySel.value] : "";

    function updateBlackMarket() {
        const cur = bmCurrencySel.value;
        const robux = Math.max(0, Math.floor(Number(bmRobuxIn.value) || 0));
        const price = Math.max(0, Number(bmPriceIn.value) || 0);
        const devexValue = robux * DEVEX_RATES.standard.usd * fx[cur];
        const tiles = [];
        if (robux && price) {
            tiles.push({ label: "Per 1K Robux", value: money(price / robux * 1000, cur) });
            tiles.push({ label: "DevEx Value", value: money(devexValue, cur) });
            tiles.push({ label: "vs DevEx", value: (price / devexValue).toFixed(2) + "×" });
            tiles.push({ label: "In USD", value: money(price / fx[cur], "USD") });
        } else {
            tiles.push({ label: "DevEx Value", value: money(devexValue, cur) });
            tiles.push({ label: "Per 1K at DevEx", value: money(DEVEX_RATES.standard.usd * 1000 * fx[cur], cur) });
        }
        document.getElementById("t-bmResult").innerHTML = tiles.map(t => `<div class="devex-tile"><div class="label">${t.label}</div><div class="value">${t.value}</div></div>`).join("");
        const verdict = robux && price
            ? (price >= devexValue ? '<span class="warn">paying more than the DevEx value</span> · ' : "below the DevEx value · ")
            : "enter what you paid to compare · ";
        document.getElementById("t-bmNote").innerHTML = verdict + "standard DevEx $" + DEVEX_RATES.standard.usd + "/Robux"
            + (cur === "USD" ? "" : " · 1 USD = " + fx[cur].toFixed(4) + " " + cur + (fxDate ? " (ECB, " + fxDate + ")" : " (approx.)"))
            + " · buying off-platform breaks the Roblox ToS and can get the account terminated";
    }
    bmRobuxIn.addEventListener("input", updateBlackMarket);
    bmPriceIn.addEventListener("input", () => {
        bmPrices[bmCurrencySel.value] = bmPriceIn.value;
        try { localStorage.setItem("bmPrices", JSON.stringify(bmPrices)); } catch (e) {}
        updateBlackMarket();
    });
    bmCurrencySel.addEventListener("change", () => {
        try { localStorage.setItem("bmCurrency", bmCurrencySel.value); } catch (e) {}
        bmPriceIn.value = bmPrices[bmCurrencySel.value] != null ? bmPrices[bmCurrencySel.value] : "";
        updateBlackMarket();
    });
    updateBlackMarket();

    document.addEventListener("roblox:open", loadFx);
})();
