# Connecting the domain

How `pavel-koleckar.cz` was pointed at the Netlify site, what went wrong on the way, and the
reasoning behind each step. Written the same way as [`EXPLANATIONS.md`](EXPLANATIONS.md): every
number and every record here was measured from the live DNS on **17 August 2026**, not recalled
from documentation.

Read this before touching DNS again. Two of the mistakes below are silent — they look like success
until hours later.

- [Part 1 — The three moving parts](#part-1--the-three-moving-parts)
- [Part 2 — The fork in the road: whose nameservers?](#part-2--the-fork-in-the-road-whose-nameservers)
- [Part 3 — The final configuration](#part-3--the-final-configuration)
- [Part 4 — The debugging log, in order](#part-4--the-debugging-log-in-order)
- [Part 5 — The command toolkit](#part-5--the-command-toolkit)
- [Part 6 — Principles worth stealing](#part-6--principles-worth-stealing)
- [Appendix — the checklist, next time](#appendix--the-checklist-next-time)

---

# Part 1 — The three moving parts

Three independent systems have to agree, and each is owned by a different party. Almost every
confusing symptom in Part 4 comes from treating them as one thing.

```
  CZ.NIC registry          who is authoritative for the zone?
  (the .cz registry)       holds: the NSSET (nameserver set) + the DNSSEC DS record
        |
        v
  one.cz nameservers       what records does the zone contain?
  (ns1/ns2/ns3.one.cz)     holds: the A record, the CNAME, the SOA
        |
        v
  Netlify                  does the hostname point at us, and do we have a cert for it?
                           holds: the domain->site binding, the TLS certificate
```

The important asymmetry: **Netlify is a consumer of DNS, not a source of truth about it.** Its
domain panel reports what it last observed by resolving your name. When the panel and a direct
query disagree, the direct query wins — that is exactly what happened twice.

Between all of this sits a fourth party nobody controls: **caching resolvers**. Google, Cloudflare,
your ISP and Chrome each keep their own copy of DNS answers, including answers that say *"this
record does not exist"*. That last detail causes the two nastiest symptoms below.

---

# Part 2 — The fork in the road: whose nameservers?

Netlify offers two ways to attach a custom domain, and the panel nudges you toward the one that was
wrong for this domain.

| approach | what it means | what Netlify shows |
| --- | --- | --- |
| **Netlify DNS** | Change the domain's nameservers to `dns1…dns4.pXX.nsone.net`. Netlify hosts the whole zone and creates records for you. | "Netlify DNS propagating…" until the nameservers actually change |
| **External DNS** | Keep the current nameservers. You add an `A` record for the apex and a `CNAME` for `www` by hand. | "External DNS" / awaiting verification |

Netlify DNS had already been enabled, which is why the panel sat on **"Netlify DNS propagating…"**
indefinitely: it had created a zone and was waiting for nameservers that were never going to point
at it.

## Why external DNS won — the DNSSEC trap

The obvious fix is to do what the panel asks and switch the nameservers. That would have taken the
domain **completely offline**. Checking first:

```
DS record in the .cz registry:
  29463 7 2 5CA07A20B3883294498A86863D21D745675751B00CC651E78421A84833BEAAE9
```

That `DS` record is the DNSSEC chain of trust. It is a cryptographic fingerprint, stored at the
*registry*, of the signing key used by the *nameservers*. Its meaning is a promise to the world:
*"answers for this domain are signed, and here is how to verify them — refuse anything that fails."*

**Netlify DNS does not support DNSSEC.** Move the nameservers to Netlify while that `DS` stays in
the registry and every validating resolver — Google, Cloudflare, most ISPs — gets unsigned answers
where signed ones were promised, treats that as an attack, and returns SERVFAIL. Not "the old site"
and not "a broken page": the domain stops resolving anywhere. Doing it safely means disabling
DNSSEC at the registrar first, waiting for the `DS` to clear, and only then changing nameservers.

Weighed against what Netlify DNS actually buys — a slightly nicer records UI — the answer was easy.
Two supporting facts, both checked rather than assumed:

- **No `MX` records exist**, so no email could break either way. (Worth checking every time; the
  classic disaster is moving nameservers and silently killing the domain's mail.)
- **Only this one site** is served from the domain, so nothing else benefits from centralising the
  zone at Netlify.

> **Principle: check what a migration silently drops before you start it, not after.** Nameserver
> changes move *the whole zone* — DNSSEC signing, mail routing, verification records, subdomains.
> The destination advertises what it adds; nothing advertises what it takes away. Enumerate the
> current zone first and ask which of it survives.

---

# Part 3 — The final configuration

## At one.cz — the DNS records

| Type | Name | Value |
| --- | --- | --- |
| A | *(blank = the apex)* | `75.2.60.5` |
| CNAME | `www` | `meek-kulfi-26b3ab.netlify.app` |

`75.2.60.5` is Netlify's published apex load-balancer address. Netlify routes by the `Host` header,
so that single IP fronts every site on the platform — the address says "Netlify", the `Host` header
says *which* Netlify site, and the domain-to-site binding in the Netlify panel is what connects the
two. This is why the `A` record alone is not enough: the domain must **also** be attached to the
site inside Netlify, or that IP has nothing to route your name to.

**The apex needs an `A` record, not a `CNAME`.** A `CNAME` says "this name is an alias for that
name" and, by the DNS specification, cannot coexist with the `SOA` and `NS` records that every zone
apex is required to have. Some providers offer `ALIAS`/`ANAME` records to fake it; one.cz does not,
so a plain `A` record it is.

### Naming the apex

one.cz's editor does not accept `@`, the conventional shorthand. **Leave the Name field blank** and
the panel fills in `pavel-koleckar.cz.` itself. (`pavel-koleckar.cz` or `pavel-koleckar.cz.` also
work in some panels. What you must avoid is typing a name that the panel then *appends the domain
to*, producing `pavel-koleckar.cz.pavel-koleckar.cz` — the classic double-suffix mistake, and
invisible in the editor's own display.)

### One name, one CNAME

At one point the zone briefly held **two** `CNAME` records for `www` — the original
`apex-loadbalancer.netlify.com` plus the new `meek-kulfi-26b3ab.netlify.app`. That is not merely
untidy, it is **invalid DNS**: a name may have exactly one `CNAME`, because a `CNAME` claims the
name *is* an alias, and a name cannot be an alias for two different things. Resolvers handed both
pick unpredictably. The old one was deleted.

## At Netlify

- The Netlify DNS zone was **deleted**, so Netlify falls back to checking external DNS.
- `pavel-koleckar.cz` stays attached to the site as the **primary domain**; `www.pavel-koleckar.cz`
  is kept as an alias that Netlify redirects to the primary.
- The site remains reachable at `meek-kulfi-26b3ab.netlify.app` throughout — the custom domain is
  additive and never puts the deployed site at risk.

## What a working request looks like

```
http://pavel-koleckar.cz/          -> 302 -> http://pavel-koleckar.cz/slovni-hra/
```

That redirect is this repo's own `[[redirects]]` rule in `poc/netlify.toml`, sending the bare root
to the base path the app is actually served under (`kit.paths.base = '/slovni-hra'`). Seeing it is
proof the request reached *this site*, not merely *some Netlify server*.

---

# Part 4 — The debugging log, in order

Six symptoms, in the order they appeared. Every one looked like a broken configuration, and only
one of them was.

## 4.1 "Netlify DNS propagating…" that never finishes

**Symptom.** The Netlify panel had shown that spinner indefinitely.

**Cause.** Netlify DNS was enabled, so Netlify was waiting for the nameservers to become
`*.nsone.net`. The registry said otherwise:

```
pavel-koleckar.cz  NS  ns1.one.cz / ns2.one.cz / ns3.one.cz
```

That state is stable, not transitional. It would have waited forever.

**Resolution.** Delete the Netlify DNS zone and use external DNS (Part 2).

## 4.2 The apex resolved to nothing while `www` half-worked

**Symptom.** The domain was unreachable, but not in the usual way.

**What the queries showed.**

```
pavel-koleckar.cz       A      -> no answer at all
www.pavel-koleckar.cz   CNAME  -> apex-loadbalancer.netlify.com -> 75.2.60.5, 99.83.231.61
```

So `www` *did* reach Netlify. And Netlify answered:

```
HTTP/1.1 301 Moved Permanently
Location: http://pavel-koleckar.cz/
Server: Netlify
```

**Cause.** A perfect dead end. `www` reached Netlify, Netlify correctly redirected to the primary
domain (the apex), and the apex had no address. Every visitor was redirected into a hole.

Note the shape of the failure: the piece that was configured worked, and pointed at the piece that
was not. The `301` was the diagnostic — it proved Netlify was receiving traffic and said exactly
where it was sending it.

**Resolution.** Add the apex `A` record.

## 4.3 The records were saved but the world could not see them

**Symptom.** The one.cz record table showed the new `A` record; nothing outside had changed.

**Cause.** The edits were staged, not published — the zone's **serial number was unchanged** at
`2026081503`. The `SOA` serial is the zone's version number, incremented on every publish. An
unchanged serial after an edit means the zone was never regenerated.

That the invalid duplicate `CNAME` was sitting there happily was a second hint: a published zone
would likely have rejected it.

**Resolution.** Use the panel's explicit save/confirm step, then re-query the authoritative server.

> **Principle: verify at the layer you changed, not at the layer you observe.** The record table in
> a web UI is the provider's draft state. `nslookup … ns1.one.cz` is the published reality. Between
> them sits a publish step that can silently not have happened.

## 4.4 Netlify's verification failed while the domain demonstrably worked

**Symptom.** Netlify's *Verify DNS configuration* returned
`pavel-koleckar.cz doesn't appear to be served by Netlify`.

**What was actually true at that moment.**

```
ns1.one.cz  (authoritative)  -> 75.2.60.5    correct, published
Cloudflare  1.1.1.1          -> 75.2.60.5    already updated
Google      8.8.8.8          -> no answer, 451s of stale TTL remaining
```

And forcing the request straight at the IP proved the site was live:

```
http://pavel-koleckar.cz/  ->  302  ->  /slovni-hra/
```

**Cause.** Whichever resolver Netlify used still held a cached *negative* answer.

This is the concept worth internalising: **resolvers cache absence.** When a name has no record, the
resolver stores that "no" and reuses it — for the duration set by the **last field of the `SOA`
record**, the negative TTL:

```
ns1.one.cz. one.one.cz. 2026081503 43200 3600 1209600 10800
                                                      ^^^^^
                                            negative TTL: 10800s = 3 hours
```

So every resolver that asked about `pavel-koleckar.cz` *before* the record existed kept answering
"no such record" for up to three hours after it started existing. Nothing you can do at the
registrar shortens that.

The corollary is a genuinely useful habit: **do not query a name before you have configured it.** A
single curious lookup at the wrong moment poisons that resolver's cache for hours.

**Resolution.** Wait, retry. It passed.

> **Principle: a negative answer is a cached answer too.** Most people know DNS changes take time to
> propagate. Far fewer know that *asking early* is what creates the delay, and that the wait is
> governed by an `SOA` field nobody reads.

## 4.5 `DNS_PROBE_FINISHED_NXDOMAIN` in the browser, long after it worked everywhere else

**Symptom.** Netlify had verified the domain and ordered a certificate, yet Chrome insisted the site
did not exist. `curl` failed too, with exit code 6 (could not resolve host).

**What the queries showed.**

```
Google      8.8.8.8              -> 75.2.60.5   OK
Cloudflare  1.1.1.1              -> 75.2.60.5   OK
czns1.vodafone.cz  31.30.90.11   -> no answer   <- the machine's own resolver
```

**Cause.** The ISP's resolver was still serving the same three-hour cached negative from 4.4. It was
the *only* resolver still doing so, and it happened to be the one the machine used. The rest of the
internet could reach the site perfectly.

`NXDOMAIN` is a slightly misleading label here — the domain plainly exists — but that is how Chrome
surfaces "the resolver gave me nothing".

**Resolution.** Clear the local caches, and if that is not enough, step around the ISP:

```cmd
ipconfig /flushdns
```

Then in Chrome, `chrome://net-internals/#dns` → **Clear host cache**. Chrome maintains its own cache
that survives the Windows flush, so both are needed.

If it still fails, the stale copy is upstream at the ISP and cannot be flushed from your machine.
Point the adapter at a public resolver instead — Windows Settings → Network → adapter → DNS server
assignment → Manual → IPv4: `1.1.1.1` and `8.8.8.8`. Effective immediately, and a better default
than an ISP resolver anyway.

> **Principle: "it's broken" and "it's broken for me" are different bugs, and one query separates
> them.** Ask a public resolver and your own resolver the same question. Matching answers mean the
> problem is real; differing answers mean the problem is local and mostly a matter of waiting.

## 4.6 The certificate

With verification passed, Netlify orders a **Let's Encrypt** certificate. Netlify quotes up to
24 hours; in practice it is usually minutes.

Until it lands, `http://` works and `https://` fails with a certificate error. Chrome upgrades to
HTTPS aggressively, so **a certificate warning is progress** — it means DNS resolved and the request
reached Netlify. That is a completely different failure from `NXDOMAIN`, and the distinction is the
fastest way to tell how far along you are. If the certificate is still missing after an hour,
Domain management → HTTPS → **Renew certificate** forces a retry.

---

# Part 5 — The command toolkit

Every command used, what it answers, and how to read it. `nslookup` ships with Windows; `curl` ships
with Windows 10 and later. All of these run in `cmd`.

**Quote URLs containing `&`.** In `cmd` an unquoted `&` splits the command line in two.

## 5.1 Ask the authoritative server — the ground truth

```cmd
nslookup -type=A pavel-koleckar.cz ns1.one.cz
nslookup -type=ANY www.pavel-koleckar.cz ns1.one.cz
```

Naming a server as the last argument bypasses **every** cache and asks the machine that actually
holds the zone. This is the only query that tells you whether your edit was published. Run it
immediately after saving records.

`-type=ANY` dumps everything at a name — it is what revealed the two conflicting `www` CNAMEs, and
later confirmed only one remained.

## 5.2 Ask public resolvers — what the world sees

```cmd
curl -s "https://dns.google/resolve?name=pavel-koleckar.cz&type=A"
curl -s -H "accept: application/dns-json" "https://cloudflare-dns.com/dns-query?name=pavel-koleckar.cz&type=A"
```

DNS-over-HTTPS, returning JSON. **The gap between these and 5.1 is the propagation delay**, made
visible.

How to read the JSON:

- An `"Answer"` array containing `"data":"75.2.60.5"` — resolved, working.
- **No `Answer`, only an `"Authority"` section with the SOA** — this is a cached *negative*. The
  `"TTL"` there is the countdown in seconds until that resolver will ask again. This is precisely
  how 4.4 and 4.5 were diagnosed rather than guessed at.

## 5.3 Check DNSSEC — the query that prevented an outage

```cmd
curl -s "https://dns.google/resolve?name=pavel-koleckar.cz&type=DS"
```

A `DS` record in the answer means the domain is DNSSEC-signed at the registry, and that **changing
nameservers without first removing it will take the domain offline**.

This one has to go over DoH: Windows `nslookup` cannot query `DS` or `DNSKEY` at all. Do not skip it
because the tool makes it awkward.

## 5.4 Check for mail before touching nameservers

```cmd
nslookup -type=MX pavel-koleckar.cz ns1.one.cz
```

No answer means no mail to break. If there *are* `MX` records, moving nameservers without recreating
them at the new provider silently destroys the domain's email.

## 5.5 Test the site before DNS has propagated

```cmd
curl -s -o NUL -w "%{http_code} -> %{redirect_url}\n" --resolve pavel-koleckar.cz:80:75.2.60.5 http://pavel-koleckar.cz/
```

`--resolve` supplies the DNS answer locally, so curl connects to that IP while still sending the real
`Host` header and requesting the real URL. It tests **the web server** with the DNS layer removed.

This is what proved the site was correctly served while Netlify's verifier was still saying it was
not. Expect `302 -> http://pavel-koleckar.cz/slovni-hra/`.

## 5.6 Reachability and headers

```cmd
curl -sI http://www.pavel-koleckar.cz/
curl -s -o NUL -w "%{http_code} -> %{redirect_url}\n" https://meek-kulfi-26b3ab.netlify.app/
```

`-I` fetches headers only. The `301` with `Server: Netlify` in 4.2 is what turned "the domain is
broken" into "the apex has no address, and here is proof the rest works".

The second command is the control: it confirms the deploy itself is healthy, independent of any
domain configuration.

## 5.7 Local versus public — is it just me?

```cmd
nslookup pavel-koleckar.cz
nslookup pavel-koleckar.cz 1.1.1.1
```

The first uses your configured resolver, the second a public one. **Different answers mean the
problem is your cache, not the domain.** This is the single most valuable two-line check in this
document — it is what turned 4.5 from a mystery into a five-minute wait.

## 5.8 The everyday check

```cmd
nslookup pavel-koleckar.cz ns1.one.cz
curl -sI https://pavel-koleckar.cz/
```

First: is the record published? Second: is the certificate issued? A certificate error on the second
while the first returns `75.2.60.5` means DNS is finished and only Let's Encrypt remains.

---

# Part 6 — Principles worth stealing

1. **Check what a migration silently drops before you start it.** Nameserver changes move the whole
   zone. DNSSEC and `MX` records are what get destroyed, and neither is mentioned by the thing you
   are migrating to.

2. **A dashboard reports what it last observed; a direct query reports what is true.** Netlify said
   "not served by Netlify" while the site was demonstrably serving. Query the layer you changed.

3. **A negative answer is a cached answer too.** DNS caches "this does not exist" just as durably as
   it caches an address — for the `SOA`'s last field, three hours here. Corollary: **do not look up
   a name before you have configured it**, because the lookup itself creates the delay.

4. **Separate "it's broken" from "it's broken for me" with one query.** Ask a public resolver and
   your own the same question. That single comparison localises the fault instantly.

5. **Test each layer with the layer below removed.** `curl --resolve` tests HTTP without DNS;
   `nslookup <name> <authoritative-server>` tests the zone without caches. Isolate, don't guess.

6. **Read the failure, don't just note it.** A `301` is not "broken" — it is Netlify telling you it
   received the request and exactly where it forwarded it. `NXDOMAIN` versus a certificate warning
   is the difference between "DNS is not working" and "DNS is working, wait for the cert".

7. **The version number tells you whether your save happened.** An unchanged `SOA` serial after an
   edit means the zone was never published. Every system with a staged-then-published shape has an
   equivalent tell; find it.

8. **Keep the fallback URL working.** The `*.netlify.app` address stayed live throughout, so none of
   this was ever an outage — just a domain that did not point anywhere yet. Additive changes let you
   debug calmly.

---

# Appendix — the checklist, next time

Attaching a domain to a Netlify site, in the order that avoids every trap above.

**Before changing anything**

1. `curl -s "https://dns.google/resolve?name=DOMAIN&type=DS"` — DNSSEC signed? If yes, **do not move
   nameservers** without disabling it at the registrar first.
2. `nslookup -type=MX DOMAIN ns1.PROVIDER` — any mail to preserve?
3. `nslookup -type=NS DOMAIN 8.8.8.8` — who is authoritative today?
4. **Do not** look up the hostnames you are about to create. Asking early caches the "no" for hours.

**Choose the approach**

5. DNSSEC in place, or mail hosted elsewhere, or only one site on the domain → **external DNS**.
   Otherwise Netlify DNS is fine, and simpler.

**Configure**

6. Netlify: delete any Netlify DNS zone; add the domain to the site; set the primary domain.
7. Registrar: `A` at the apex (blank name) → `75.2.60.5`; `CNAME` `www` → `<site>.netlify.app`.
   Exactly one `CNAME` per name.
8. **Publish**, then confirm with `nslookup -type=A DOMAIN ns1.PROVIDER`. Check the `SOA` serial
   changed.

**Verify**

9. `curl --resolve DOMAIN:80:75.2.60.5 http://DOMAIN/` — the site answers, DNS aside.
10. Netlify → *Verify DNS configuration*. If it fails, check the public resolvers first — it is
    almost certainly a stale negative cache, not a misconfiguration. Wait and retry.
11. Let the certificate issue. `https://` failing while `http://` works is expected in the gap.
12. Browser still showing `NXDOMAIN` after everything else works? `ipconfig /flushdns`, clear
    Chrome's cache at `chrome://net-internals/#dns`, and compare your resolver against `1.1.1.1`.
