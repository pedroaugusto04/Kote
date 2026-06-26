import './ExtensionPrivacyPage.css';

export function ExtensionPrivacyPage() {
  return (
    <div className="extension-privacy-page">
      <div className="privacy-container">
        <div className="privacy-header">
          <h1>Privacy Policy – Kote Browser Extension</h1>
          <p className="last-updated">Last Updated: June 26, 2026</p>
        </div>

        <div className="privacy-content">
          <section>
            <h2>Introduction</h2>
            <p>
              This Privacy Policy explains how the Kote Browser Extension ("the Extension") collects, uses, and protects your information. The Extension is a Chrome browser extension that allows you to save web pages, text selections, code snippets, links, and AI chat conversations to your Kote knowledge base.
            </p>
            <p>
              We are committed to protecting your privacy and ensuring the security of your data. This policy outlines our practices for the Extension only.
            </p>
          </section>

          <section>
            <h2>Scope</h2>
            <p>
              This Privacy Policy applies <strong>solely</strong> to the Kote Browser Extension for Google Chrome. It does not apply to the Kote web application, mobile applications, or other Kote services. For information about other Kote products, please refer to their respective privacy policies.
            </p>
          </section>

          <section>
            <h2>Information We Collect</h2>
            <p>
              The Extension collects information only when you perform an explicit action, such as clicking a button, using a keyboard shortcut, or selecting an option from the context menu. We do not collect data automatically or in the background.
            </p>

            <h3>Types of Information Collected</h3>
            <ul>
              <li><strong>Content you save:</strong> Web pages, selected text, code snippets, links, and AI chat conversations that you explicitly choose to save to your Kote knowledge base.</li>
              <li><strong>Authentication data:</strong> Authentication tokens may be used to identify your account and associate saved content with your user profile.</li>
              <li><strong>Technical data:</strong> Minimal technical information necessary for the Extension to function, such as extension version and browser type.</li>
            </ul>

            <h3>What We Do Not Collect</h3>
            <ul>
              <li>We do <strong>not</strong> track your browsing history automatically.</li>
              <li>We do <strong>not</strong> collect data in the background without your explicit action.</li>
              <li>We do <strong>not</strong> collect analytics or usage statistics beyond what is necessary for the Extension to function.</li>
              <li>We do <strong>not</strong> sell your data to third parties.</li>
              <li>We do <strong>not</strong> use your data for advertising purposes.</li>
            </ul>
          </section>

          <section>
            <h2>How We Use Information</h2>
            <p>We use the information collected through the Extension solely to provide the knowledge base functionality:</p>
            <ul>
              <li>To save and store content you explicitly submit to your Kote knowledge base.</li>
              <li>To authenticate your account and associate saved content with your profile.</li>
              <li>To enable you to access, organize, and manage your saved content through the Kote platform.</li>
              <li>To transmit your data securely to the Kote backend servers.</li>
            </ul>
            <p>We do not use your data for any other purposes, including advertising, marketing, or selling to third parties.</p>
          </section>

          <section>
            <h2>Data Storage & Security</h2>

            <h3>Data Transmission</h3>
            <p>All data transmitted from the Extension to the Kote backend is sent securely via HTTPS encryption.</p>

            <h3>Data Storage</h3>
            <p>Your data is stored securely on Kote servers. We implement industry-standard security measures to protect your information, including:</p>
            <ul>
              <li>Encryption of data in transit and at rest where applicable.</li>
              <li>Access controls to limit who can view your data.</li>
              <li>Regular security reviews and updates.</li>
            </ul>

            <h3>Your Responsibility</h3>
            <p>You are responsible for maintaining the security of your authentication credentials and account access. If you believe your account has been compromised, you should change your password and contact us immediately.</p>
          </section>

          <section>
            <h2>Third-Party Services</h2>
            <p>The Extension may interact with the following third-party services:</p>
            <ul>
              <li><strong>Kote Backend API:</strong> Your data is transmitted to and stored on Kote servers, which are operated by us.</li>
              <li><strong>Google Chrome Platform:</strong> The Extension operates within the Chrome browser environment and may use Chrome storage APIs for local configuration settings.</li>
            </ul>
            <p>We do not share your data with any other third parties for their own marketing or advertising purposes.</p>
          </section>

          <section>
            <h2>Data Retention</h2>
            <p>Your data is retained in your Kote knowledge base for as long as your account remains active, or until you request deletion. You may delete individual items or request deletion of all your data at any time (see "User Rights" below).</p>
            <p>If you delete your account or request data deletion, we will remove your data from our servers within a reasonable timeframe, typically within 30 days.</p>
          </section>

          <section>
            <h2>User Rights</h2>
            <p>You have the following rights regarding your data:</p>
            <ul>
              <li><strong>Access:</strong> You can view and manage your saved content through the Kote web application.</li>
              <li><strong>Deletion:</strong> You can delete individual items from your knowledge base at any time. You may also request deletion of all your data by contacting us.</li>
              <li><strong>Export:</strong> You may request an export of your data in a machine-readable format.</li>
              <li><strong>Account Closure:</strong> You may close your account, which will result in the deletion of your data.</li>
            </ul>
            <p>To exercise these rights, please contact us using the information provided in the "Contact Information" section below.</p>
          </section>

          <section>
            <h2>Children's Privacy</h2>
            <p>The Extension is not intended for use by children under the age of 13. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us, and we will delete such information.</p>
          </section>

          <section>
            <h2>Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors. We will notify users of significant changes by:</p>
            <ul>
              <li>Updating the "Last Updated" date at the top of this policy.</li>
              <li>Posting a notice on the Kote website or within the Extension when feasible.</li>
            </ul>
            <p>Your continued use of the Extension after such changes constitutes your acceptance of the updated policy.</p>
          </section>

          <section>
            <h2>Contact Information</h2>
            <p>If you have questions, concerns, or requests regarding this Privacy Policy or your data, please contact us:</p>
            <ul>
              <li><strong>Website:</strong> <a href="https://knowledgebase.sbs/kote" target="_blank" rel="noopener noreferrer">https://knowledgebase.sbs/kote</a></li>
              <li><strong>Privacy Policy URL:</strong> <a href="https://knowledgebase.sbs/kote/extension/privacy" target="_blank" rel="noopener noreferrer">https://knowledgebase.sbs/kote/extension/privacy</a></li>
              <li><strong>Email:</strong> <a href="mailto:pedroaugustoaduarte@gmail.com">pedroaugustoaduarte@gmail.com</a></li>
            </ul>
          </section>
        </div>

        <div className="privacy-footer">
          <p>This Privacy Policy is effective as of June 26, 2026.</p>
        </div>
      </div>
    </div>
  );
}
