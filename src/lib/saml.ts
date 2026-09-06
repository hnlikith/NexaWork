/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import crypto from "crypto";

export async function generateSSOKeyPair(): Promise<{ privateKey: string; publicKey: string; certificate: string }> {
  const selfsigned = require("selfsigned");
  const attrs = [{ name: "commonName", value: "NexaWork SAML IdP" }];
  const pems = await selfsigned.generate(attrs, { days: 3650, keySize: 2048 });
  return {
    privateKey: pems.private,
    publicKey: pems.public,
    certificate: pems.cert,
  };
}

export function generateSAMLResponse(
  userEmail: string,
  acsUrl: string,
  issuer: string,
  privateKey: string,
  certificate: string,
  // Zoho's SP entity id / Audience. For an India (.in) data-center org this is
  // "zoho.in" (confirmed from Zoho's own AuthnRequest Issuer). Sending the wrong
  // audience is one cause of a silently-rejected assertion.
  audience: string = "zoho.in"
): string {
  const { SignedXml } = require("xml-crypto");

  const assertionId = "_" + crypto.randomUUID().replace(/-/g, "");
  const responseId = "_" + crypto.randomUUID().replace(/-/g, "");
  const sessionIndex = "_" + crypto.randomUUID().replace(/-/g, "");

  const now = new Date().toISOString();
  const notBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min skew
  const notOnOrAfter = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min validity

  const unsignedAssertion = 
    `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${assertionId}" IssueInstant="${now}" Version="2.0">` +
      `<saml:Issuer>${issuer}</saml:Issuer>` +
      `<saml:Subject>` +
        `<saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${userEmail}</saml:NameID>` +
        `<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">` +
          `<saml:SubjectConfirmationData NotOnOrAfter="${notOnOrAfter}" Recipient="${acsUrl}"/>` +
        `</saml:SubjectConfirmation>` +
      `</saml:Subject>` +
      `<saml:Conditions NotBefore="${notBefore}" NotOnOrAfter="${notOnOrAfter}">` +
        `<saml:AudienceRestriction>` +
          `<saml:Audience>${audience}</saml:Audience>` +
        `</saml:AudienceRestriction>` +
      `</saml:Conditions>` +
      `<saml:AuthnStatement AuthnInstant="${now}" SessionIndex="${sessionIndex}">` +
        `<saml:AuthnContext>` +
          `<saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef>` +
        `</saml:AuthnContext>` +
      `</saml:AuthnStatement>` +
    `</saml:Assertion>`;

  const sig = new SignedXml();
  sig.privateKey = privateKey;
  sig.publicCert = certificate;
  
  sig.addReference({
    xpath: "//*[local-name(.)='Assertion']",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/2001/10/xml-exc-c14n#",
    ],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
  });

  sig.signatureAlgorithm = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
  sig.canonicalizationAlgorithm = "http://www.w3.org/2001/10/xml-exc-c14n#";

  sig.computeSignature(unsignedAssertion, {
    location: {
      reference: "//*[local-name(.)='Issuer']",
      action: "after",
    },
  });

  const signedAssertion = sig.getSignedXml();

  const samlResponse = 
    `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="${responseId}" Version="2.0" IssueInstant="${now}" Destination="${acsUrl}">` +
      `<saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${issuer}</saml:Issuer>` +
      `<samlp:Status>` +
        `<samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>` +
      `</samlp:Status>` +
      signedAssertion +
    `</samlp:Response>`;

  return Buffer.from(samlResponse, "utf8").toString("base64");
}
