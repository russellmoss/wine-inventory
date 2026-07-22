// Supplies intermediate CA certificates that a publisher's server FAILS TO SEND, so the crawler can
// verify a chain a browser handles transparently.
//
// WHY THIS EXISTS. A correctly configured TLS server sends its leaf certificate PLUS every
// intermediate up to (not including) a trusted root. Some publishers ship only the leaf. Browsers
// paper over it: the leaf carries an AIA extension pointing at its issuer, and browsers fetch the
// missing intermediate on the fly. **Node does not do AIA fetching**, so the same host that loads
// fine in a browser fails in the crawler with UNABLE_TO_VERIFY_LEAF_SIGNATURE. That asymmetry is the
// trap — the site looks perfectly healthy when you check it by hand.
//
// WHY THIS IS NOT A SECURITY HOLE. Every certificate here is a publicly-trusted intermediate that is
// ITSELF signed by a root already in Node's bundle. Supplying it grants no trust that the existing
// root did not already confer — it only restores a link the server omitted. It is emphatically NOT
// the same as adding a private root, and it is NOT `rejectUnauthorized: false`: verification stays
// fully on, hostname checks stay on, expiry checks stay on. A forged certificate is still refused.
//
// ADDING ONE. Diagnose first — `openssl s_client -connect <host>:443 -servername <host>` and look at
// the printed chain. If it shows ONLY `0 s:` then the intermediate is missing and belongs here. If it
// shows a full chain, the failure is something else and this file is the wrong fix. Fetch the
// intermediate from the AIA URL in the leaf, verify its subject/issuer, and add it below WITH a note
// naming the affected host — otherwise nobody can tell later whether an entry is still needed.
//
// PREFER REPORTING IT. This is the publisher's misconfiguration and it breaks every non-browser
// client they have. Telling them is a one-line server fix (serve the fullchain, not just the leaf).
// Entries here are a workaround, not a destination.

import tls from "node:tls";
import { Agent, type Dispatcher } from "undici";

/**
 * Sectigo Public Server Authentication CA DV R36 — issued by "Sectigo Public Server Authentication
 * Root R46", which IS in Node's bundle. Valid 2021-03-22 → 2036-03-21.
 *
 * Needed by: ives-technicalreviews.eu (IVES Technical Reviews). Verified 2026-07-22 — the server
 * sends chain depth 0 only. Source: http://crt.sectigo.com/SectigoPublicServerAuthenticationCADVR36.crt
 */
const SECTIGO_PUBLIC_SERVER_AUTH_CA_DV_R36 = `-----BEGIN CERTIFICATE-----
MIIGTDCCBDSgAwIBAgIQOXpmzCdWNi4NqofKbqvjsTANBgkqhkiG9w0BAQwFADBf
MQswCQYDVQQGEwJHQjEYMBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTYwNAYDVQQD
Ey1TZWN0aWdvIFB1YmxpYyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gUm9vdCBSNDYw
HhcNMjEwMzIyMDAwMDAwWhcNMzYwMzIxMjM1OTU5WjBgMQswCQYDVQQGEwJHQjEY
MBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTcwNQYDVQQDEy5TZWN0aWdvIFB1Ymxp
YyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gQ0EgRFYgUjM2MIIBojANBgkqhkiG9w0B
AQEFAAOCAY8AMIIBigKCAYEAljZf2HIz7+SPUPQCQObZYcrxLTHYdf1ZtMRe7Yeq
RPSwygz16qJ9cAWtWNTcuICc++p8Dct7zNGxCpqmEtqifO7NvuB5dEVexXn9RFFH
12Hm+NtPRQgXIFjx6MSJcNWuVO3XGE57L1mHlcQYj+g4hny90aFh2SCZCDEVkAja
EMMfYPKuCjHuuF+bzHFb/9gV8P9+ekcHENF2nR1efGWSKwnfG5RawlkaQDpRtZTm
M64TIsv/r7cyFO4nSjs1jLdXYdz5q3a4L0NoabZfbdxVb+CUEHfB0bpulZQtH1Rv
38e/lIdP7OTTIlZh6OYL6NhxP8So0/sht/4J9mqIGxRFc0/pC8suja+wcIUna0HB
pXKfXTKpzgis+zmXDL06ASJf5E4A2/m+Hp6b84sfPAwQ766rI65mh50S0Di9E3Pn
2WcaJc+PILsBmYpgtmgWTR9eV9otfKRUBfzHUHcVgarub/XluEpRlTtZudU5xbFN
xx/DgMrXLUAPaI60fZ6wA+PTAgMBAAGjggGBMIIBfTAfBgNVHSMEGDAWgBRWc1hk
lfmSGrASKgRieaFAFYghSTAdBgNVHQ4EFgQUaMASFhgOr872h6YyV6NGUV3LBycw
DgYDVR0PAQH/BAQDAgGGMBIGA1UdEwEB/wQIMAYBAf8CAQAwHQYDVR0lBBYwFAYI
KwYBBQUHAwEGCCsGAQUFBwMCMBsGA1UdIAQUMBIwBgYEVR0gADAIBgZngQwBAgEw
VAYDVR0fBE0wSzBJoEegRYZDaHR0cDovL2NybC5zZWN0aWdvLmNvbS9TZWN0aWdv
UHVibGljU2VydmVyQXV0aGVudGljYXRpb25Sb290UjQ2LmNybDCBhAYIKwYBBQUH
AQEEeDB2ME8GCCsGAQUFBzAChkNodHRwOi8vY3J0LnNlY3RpZ28uY29tL1NlY3Rp
Z29QdWJsaWNTZXJ2ZXJBdXRoZW50aWNhdGlvblJvb3RSNDYucDdjMCMGCCsGAQUF
BzABhhdodHRwOi8vb2NzcC5zZWN0aWdvLmNvbTANBgkqhkiG9w0BAQwFAAOCAgEA
YtOC9Fy+TqECFw40IospI92kLGgoSZGPOSQXMBqmsGWZUQ7rux7cj1du6d9rD6C8
ze1B2eQjkrGkIL/OF1s7vSmgYVafsRoZd/IHUrkoQvX8FZwUsmPu7amgBfaY3g+d
q1x0jNGKb6I6Bzdl6LgMD9qxp+3i7GQOnd9J8LFSietY6Z4jUBzVoOoz8iAU84OF
h2HhAuiPw1ai0VnY38RTI+8kepGWVfGxfBWzwH9uIjeooIeaosVFvE8cmYUB4TSH
5dUyD0jHct2+8ceKEtIoFU/FfHq/mDaVnvcDCZXtIgitdMFQdMZaVehmObyhRdDD
4NQCs0gaI9AAgFj4L9QtkARzhQLNyRf87Kln+YU0lgCGr9HLg3rGO8q+Y4ppLsOd
unQZ6ZxPNGIfOApbPVf5hCe58EZwiWdHIMn9lPP6+F404y8NNugbQixBber+x536
WrZhFZLjEkhp7fFXf9r32rNPfb74X/U90Bdy4lzp3+X1ukh1BuMxA/EEhDoTOS3l
7ABvc7BYSQubQ2490OcdkIzUh3ZwDrakMVrbaTxUM2p24N6dB+ns2zptWCva6jzW
r8IWKIMxzxLPv5Kt3ePKcUdvkBU/smqujSczTzzSjIoR5QqQA6lN1ZRSnuHIWCvh
JEltkYnTAH41QJ6SAWO66GrrUESwN/cgZzL4JLEqz1Y=
-----END CERTIFICATE-----`;

/** Every extra intermediate, in addition to Node's built-in roots. Exported for the unit test. */
export const EXTRA_INTERMEDIATE_CERTS: readonly string[] = [SECTIGO_PUBLIC_SERVER_AUTH_CA_DV_R36];

/**
 * The full CA list the crawler trusts: Node's bundled roots PLUS the intermediates above.
 *
 * The spread is load-bearing. undici's `connect.ca` REPLACES the default trust store rather than
 * adding to it, so passing only the extra certs would break TLS for every OTHER source in the
 * corpus while fixing one.
 */
export function crawlCaBundle(): string[] {
  return [...tls.rootCertificates, ...EXTRA_INTERMEDIATE_CERTS];
}

let cached: Agent | null = null;

/**
 * Memoized dispatcher for all crawler fetches. Memoized because an undici Agent owns a connection
 * pool — building one per request would discard keep-alive and re-handshake TLS on every page of a
 * multi-hundred-page crawl.
 */
export function crawlDispatcher(): Dispatcher {
  cached ??= new Agent({ connect: { ca: crawlCaBundle() } });
  return cached;
}
