import assert from 'node:assert/strict';
import { extractSolicitationLinks } from '../src/connectors/genericWeb';

const pageUrl = 'https://dir.texas.gov/procurement-opportunities';

const html = `
<html>
<body>
  <table>
    <tr>
      <td>
        <a href="/solicitations/rfp-2026-001">
          RFP 2026-001 - Laptop Procurement
        </a>
      </td>
    </tr>
    <tr>
      <td>
        <a href="/solicitations/rfq-2026-002">
          RFQ 2026-002 - Desktop Computers
        </a>
      </td>
    </tr>
    <tr>
      <td>
        <a href="/about">About Texas DIR</a>
      </td>
    </tr>
    <tr>
      <td>
        <a href="https://external.example.com/rfp">
          External RFP
        </a>
      </td>
    </tr>
    <tr>
      <td>
        <a href="/documents/rfp.pdf">
          Download RFP PDF
        </a>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const links = extractSolicitationLinks(html, pageUrl);

console.log(JSON.stringify(links, null, 2));

assert.equal(links.length, 2);
assert.equal(
  links[0].url,
  'https://dir.texas.gov/solicitations/rfp-2026-001',
);
assert.equal(
  links[1].url,
  'https://dir.texas.gov/solicitations/rfq-2026-002',
);

console.log('PASS: Solicitation link extraction works correctly.');