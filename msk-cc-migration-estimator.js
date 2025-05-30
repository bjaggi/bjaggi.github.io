// Get React from the global scope
const { useState, useMemo, useEffect, Fragment } = React;

console.log('Loading MSK Migration Estimator...');

// Tailwind CSS is assumed to be available in the environment
const App = () => {
  console.log('Initializing App component...');
  
  const [formData, setFormData] = useState({
    // General & Scope
    numMskClusters: 1,
    desiredTimeline: '6-12_months',
    hasStrictNFRs: 'no',
    teamKafkaExperience: 'medium',
    dedicatedMigrationTeam: 'no',

    // Kafka Core & Data Migration
    numTopics: 10,
    numPartitions: 100,
    hasComplexTopicConfigs: 'no',
    historicalDataMigration: 'no',
    acceptableDowntime: 'hours',
    preferredDataMigrationTool: 'mirrormaker2',
    numConsumerGroups: 10,
    offsetMigrationRequired: 'no',

    // Applications & Connectivity
    numApplications: 5,
    diverseLanguages: 'no',
    mskAuthentication: 'iam', // Default to IAM as it's a common MSK auth
    privateConnectivityRequired: 'yes',
    credentialManagement: 'secrets_manager',

    // Ecosystem & Operational Tools
    usesSchemaRegistry: 'no',
    schemaRegistryType: 'aws_glue',
    usesKafkaConnect: 'no',
    kafkaConnectType: 'msk_connect',
    numConnectors: 0,
    usesKsqlDB: 'no',
    usesOtherStreamProcessing: 'no',
    monitoringTools: 'cloudwatch',
    loggingTools: 'cloudwatch_logs',
    customMskAutomation: 'no',

    // Security & Governance
    aclManagement: 'iam_policies',
    numServiceAccounts: 5,
    auditingRequirements: 'basic',
    complianceRequirements: 'no',
    customKeyEncryption: 'no',
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const calculateComplexity = useMemo(() => {
    let totalScore = 0;
    const categoryScores = {
      general: 0,
      kafkaCore: 0,
      applications: 0,
      ecosystem: 0,
      security: 0,
    };

    // --- General & Scope ---
    if (formData.numMskClusters > 5) categoryScores.general += 5;
    else if (formData.numMskClusters > 2) categoryScores.general += 3;
    else categoryScores.general += 1;

    if (formData.desiredTimeline === '<3_months') categoryScores.general += 5;
    else if (formData.desiredTimeline === '3-6_months') categoryScores.general += 3;
    else categoryScores.general += 1;

    if (formData.hasStrictNFRs === 'yes') categoryScores.general += 4;

    if (formData.teamKafkaExperience === 'low') categoryScores.general += 4;
    else if (formData.teamKafkaExperience === 'medium') categoryScores.general += 2;

    if (formData.dedicatedMigrationTeam === 'no') categoryScores.general += 3;

    // --- Kafka Core & Data Migration ---
    if (formData.numTopics > 100) categoryScores.kafkaCore += 5;
    else if (formData.numTopics > 50) categoryScores.kafkaCore += 3;
    else categoryScores.kafkaCore += 1;

    if (formData.numPartitions > 1000) categoryScores.kafkaCore += 5;
    else if (formData.numPartitions > 500) categoryScores.kafkaCore += 3;
    else categoryScores.kafkaCore += 1;

    if (formData.hasComplexTopicConfigs === 'yes') categoryScores.kafkaCore += 3;

    if (formData.historicalDataMigration === 'full') categoryScores.kafkaCore += 5;
    else if (formData.historicalDataMigration === 'partial') categoryScores.kafkaCore += 3;

    if (formData.acceptableDowntime === 'minutes') categoryScores.kafkaCore += 5;
    else if (formData.acceptableDowntime === 'hours') categoryScores.kafkaCore += 3;

    if (formData.preferredDataMigrationTool === 'custom') categoryScores.kafkaCore += 4;

    if (formData.numConsumerGroups > 50) categoryScores.kafkaCore += 4;
    else if (formData.numConsumerGroups > 20) categoryScores.kafkaCore += 2;

    if (formData.offsetMigrationRequired === 'yes') categoryScores.kafkaCore += 3;

    // --- Applications & Connectivity ---
    if (formData.numApplications > 50) categoryScores.applications += 5;
    else if (formData.numApplications > 20) categoryScores.applications += 3;
    else categoryScores.applications += 1;

    if (formData.diverseLanguages === 'yes') categoryScores.applications += 4;

    if (formData.mskAuthentication === 'iam') categoryScores.applications += 5; // IAM requires more client-side changes
    else if (formData.mskAuthentication === 'mtls') categoryScores.applications += 4; // mTLS also complex
    else categoryScores.applications += 2; // SASL/SCRAM is easier to port

    if (formData.privateConnectivityRequired === 'yes') categoryScores.applications += 3;

    if (formData.credentialManagement === 'direct_config') categoryScores.applications += 3; // Hardcoded credentials are a risk/effort to change

    // --- Ecosystem & Operational Tools ---
    if (formData.usesSchemaRegistry === 'yes') {
      categoryScores.ecosystem += 3;
      if (formData.schemaRegistryType === 'self_managed') categoryScores.ecosystem += 2; // More effort to port
    }

    if (formData.usesKafkaConnect === 'yes') {
      categoryScores.ecosystem += 3;
      if (formData.kafkaConnectType === 'self_managed') categoryScores.ecosystem += 3; // More effort to port
      categoryScores.ecosystem += Math.min(formData.numConnectors / 5, 5); // Scale based on number of connectors
    }

    if (formData.usesKsqlDB === 'yes') categoryScores.ecosystem += 5;
    if (formData.usesOtherStreamProcessing === 'yes') categoryScores.ecosystem += 4;

    if (formData.monitoringTools === 'custom' || formData.monitoringTools === 'multiple') categoryScores.ecosystem += 3;
    if (formData.loggingTools === 'custom' || formData.loggingTools === 'multiple') categoryScores.ecosystem += 3;

    if (formData.customMskAutomation === 'yes') categoryScores.ecosystem += 4;

    // --- Security & Governance ---
    if (formData.aclManagement === 'iam_policies') categoryScores.security += 4; // IAM policies map to RBAC differently
    else if (formData.aclManagement === 'manual') categoryScores.security += 3;

    if (formData.numServiceAccounts > 20) categoryScores.security += 3;
    else if (formData.numServiceAccounts > 10) categoryScores.security += 2;

    if (formData.auditingRequirements === 'strict') categoryScores.security += 3;

    if (formData.complianceRequirements === 'yes') categoryScores.security += 5;

    if (formData.customKeyEncryption === 'yes') categoryScores.security += 4;


    for (const category in categoryScores) {
      totalScore += categoryScores[category];
    }

    let effortLevel;
    if (totalScore <= 25) effortLevel = 'Low Effort';
    else if (totalScore <= 50) effortLevel = 'Medium Effort';
    else if (totalScore <= 75) effortLevel = 'High Effort';
    else effortLevel = 'Very High Effort';

    return { totalScore, categoryScores, effortLevel };
  }, [formData]);

  const { totalScore, categoryScores, effortLevel } = calculateComplexity;

  const getRecommendations = useMemo(() => {
    const recommendations = [];
    const sortedCategories = Object.entries(categoryScores).sort(([, scoreA], [, scoreB]) => scoreB - scoreA);

    if (totalScore > 25) { // Only provide detailed recommendations for non-low effort migrations
      recommendations.push(
        `Overall Estimated Effort: **${effortLevel}** (Total Score: ${totalScore}).`
      );
      recommendations.push("Focus areas for de-risking and acceleration:");

      sortedCategories.forEach(([category, score]) => {
        if (score > 5) { // Threshold for significant complexity in a category
          let categoryName = '';
          let specificRecs = [];
          switch (category) {
            case 'general':
              categoryName = 'General Planning & Scope';
              if (formData.desiredTimeline === '<3_months') specificRecs.push("Consider extending the timeline if possible, or ensure sufficient dedicated resources for a rapid migration.");
              if (formData.hasStrictNFRs === 'yes') specificRecs.push("Thoroughly define and test NFRs in Confluent Cloud early in the process.");
              if (formData.teamKafkaExperience === 'low' || formData.dedicatedMigrationTeam === 'no') specificRecs.push("Invest in Confluent Cloud training for your team or consider professional services support.");
              break;
            case 'kafkaCore':
              categoryName = 'Kafka Core & Data Migration';
              if (formData.historicalDataMigration !== 'no') specificRecs.push("Plan your data migration strategy carefully, potentially using Confluent Replicator or MirrorMaker 2. Monitor replication lag closely.");
              if (formData.acceptableDowntime === 'minutes') specificRecs.push("Implement a robust dual-write and phased cutover strategy with extensive testing to minimize downtime.");
              if (formData.numTopics > 100 || formData.numPartitions > 1000) specificRecs.push("Automate topic creation and configuration on Confluent Cloud.");
              if (formData.offsetMigrationRequired === 'yes') specificRecs.push("Ensure consumer offset migration is thoroughly planned and tested, especially for critical consumer groups.");
              break;
            case 'applications':
              categoryName = 'Application & Connectivity';
              if (formData.mskAuthentication === 'iam') specificRecs.push("The shift from IAM authentication to Confluent Cloud's API Key/Secret model will require significant client-side code changes and thorough testing.");
              if (formData.diverseLanguages === 'yes') specificRecs.push("Ensure all language-specific Kafka client libraries are updated and compatible with Confluent Cloud's authentication and versions.");
              if (formData.privateConnectivityRequired === 'yes') specificRecs.push("Establish and validate private network connectivity (PrivateLink/VPC Peering) early in the migration.");
              break;
            case 'ecosystem':
              categoryName = 'Ecosystem & Operational Tools';
              if (formData.usesSchemaRegistry === 'yes' && formData.schemaRegistryType === 'self_managed') specificRecs.push("Migrate your self-managed Schema Registry to Confluent Cloud's managed service, including schema migration and client updates.");
              if (formData.usesKafkaConnect === 'yes' && formData.kafkaConnectType === 'self_managed') specificRecs.push("Migrate self-managed Kafka Connect instances to Confluent Cloud's managed Connect service. Review and reconfigure all connectors.");
              if (formData.usesKsqlDB === 'yes' || formData.usesOtherStreamProcessing === 'yes') specificRecs.push("Port and validate ksqlDB queries or other stream processing applications to Confluent Cloud's managed ksqlDB or appropriate services.");
              if (formData.customMskAutomation === 'yes') specificRecs.push("Re-evaluate and re-implement custom MSK automation using Confluent Cloud APIs or CLI.");
              break;
            case 'security':
              categoryName = 'Security & Governance';
              if (formData.aclManagement === 'iam_policies') specificRecs.push("Translate IAM policies to Confluent Cloud's RBAC model. This requires careful planning and testing of permissions.");
              if (formData.complianceRequirements === 'yes') specificRecs.push("Thoroughly review Confluent Cloud's compliance certifications and ensure they meet your regulatory needs.");
              if (formData.customKeyEncryption === 'yes') specificRecs.push("Verify Confluent Cloud's support for customer-managed encryption keys if required.");
              break;
            default:
              break;
          }
          if (specificRecs.length > 0) {
            recommendations.push(`- **${categoryName}** (Score: ${score}):`);
            specificRecs.forEach(rec => recommendations.push(`  - ${rec}`));
          }
        }
      });
    } else {
      recommendations.push("This migration appears to be **Low Effort**. Focus on standard best practices for connectivity, testing, and phased cutover.");
    }

    return recommendations;
  }, [totalScore, categoryScores, formData]);

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-8 font-sans text-gray-800">
      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-xl p-6 sm:p-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-center text-indigo-700 mb-6">
          AWS MSK to Confluent Cloud Migration Estimator
        </h1>
        <p className="text-center text-gray-600 mb-8">
          Answer the questions below to get an estimated complexity and level of effort for your migration.
        </p>

        <form className="space-y-8">
          {/* General & Scope */}
          <Section title="1. General & Scope">
            <Question label="How many AWS MSK clusters do you currently operate?" name="numMskClusters" type="number" value={formData.numMskClusters} onChange={handleChange} min="1" />
            <Question label="What is the desired timeline for the migration?" name="desiredTimeline" type="select" value={formData.desiredTimeline} onChange={handleChange}>
              <option value=">12_months">{'>'} 12 months</option>
              <option value="6-12_months">6-12 months</option>
              <option value="3-6_months">3-6 months</option>
              <option value="<3_months">{'<'} 3 months (Aggressive)</option>
            </Question>
            <Question label="Are there any specific non-functional requirements (NFRs) like strict RPO/RTO, specific latency targets, or certifications?" name="hasStrictNFRs" type="select" value={formData.hasStrictNFRs} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="What is the current team's experience level with Kafka, MSK, and cloud migrations?" name="teamKafkaExperience" type="select" value={formData.teamKafkaExperience} onChange={handleChange}>
              <option value="high">High (Expert)</option>
              <option value="medium">Medium (Experienced)</option>
              <option value="low">Low (Limited)</option>
            </Question>
            <Question label="Will a dedicated team be allocated for this migration?" name="dedicatedMigrationTeam" type="select" value={formData.dedicatedMigrationTeam} onChange={handleChange}>
              <option value="yes">Yes</option>
              <option value="no">No (Part-time / Shared resources)</option>
            </Question>
          </Section>

          {/* Kafka Core & Data Migration */}
          <Section title="2. Kafka Core & Data Migration">
            <Question label="How many active Kafka topics are in use across all MSK clusters?" name="numTopics" type="number" value={formData.numTopics} onChange={handleChange} min="1" />
            <Question label="What is the total number of partitions across all topics?" name="numPartitions" type="number" value={formData.numPartitions} onChange={handleChange} min="1" />
            <Question label="Are there any topics with specific/complex configurations (e.g., custom retention, compaction, replication factor)?" name="hasComplexTopicConfigs" type="select" value={formData.hasComplexTopicConfigs} onChange={handleChange}>
              <option value="no">No (Mostly defaults)</option>
              <option value="yes">Yes (Several custom configs)</option>
            </Question>
            <Question label="Is historical data migration required from MSK to Confluent Cloud?" name="historicalDataMigration" type="select" value={formData.historicalDataMigration} onChange={handleChange}>
              <option value="no">No (Only new data)</option>
              <option value="partial">Partial (Select topics)</option>
              <option value="full">Full (All topics)</option>
            </Question>
            <Question label="What is the acceptable downtime during the cutover?" name="acceptableDowntime" type="select" value={formData.acceptableDowntime} onChange={handleChange}>
              <option value="days">Days</option>
              <option value="hours">Hours</option>
              <option value="minutes">Minutes (Near-zero downtime)</option>
            </Question>
            <Question label="What is your preferred method for data migration?" name="preferredDataMigrationTool" type="select" value={formData.preferredDataMigrationTool} onChange={handleChange}>
              <option value="mirrormaker2">MirrorMaker 2</option>
              <option value="confluent_replicator">Confluent Replicator</option>
              <option value="application_replay">Application-level Replay</option>
              <option value="custom">Custom/Other</option>
            </Question>
            <Question label="How many active consumer groups are consuming from MSK?" name="numConsumerGroups" type="number" value={formData.numConsumerGroups} onChange={handleChange} min="1" />
            <Question label="Is consumer offset migration a hard requirement for all groups?" name="offsetMigrationRequired" type="select" value={formData.offsetMigrationRequired} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
          </Section>

          {/* Applications & Connectivity */}
          <Section title="3. Applications & Connectivity">
            <Question label="How many distinct applications (producers/consumers) interact with MSK?" name="numApplications" type="number" value={formData.numApplications} onChange={handleChange} min="1" />
            <Question label="Do your applications use a diverse set of programming languages/client libraries (e.g., Java, Python, Go, .NET)?" name="diverseLanguages" type="select" value={formData.diverseLanguages} onChange={handleChange}>
              <option value="no">No (Mostly one language/stack)</option>
              <option value="yes">Yes (Multiple languages/stacks)</option>
            </Question>
            <Question label="What authentication mechanism is currently used for MSK?" name="mskAuthentication" type="select" value={formData.mskAuthentication} onChange={handleChange}>
              <option value="iam">IAM Authentication</option>
              <option value="sasl_scram">SASL/SCRAM</option>
              <option value="mtls">mTLS</option>
              <option value="plain">SASL/PLAIN</option>
            </Question>
            <Question label="Is private network connectivity (e.g., AWS PrivateLink, VPC Peering) a requirement for Confluent Cloud?" name="privateConnectivityRequired" type="select" value={formData.privateConnectivityRequired} onChange={handleChange}>
              <option value="yes">Yes</option>
              <option value="no">No (Public internet access is acceptable)</option>
            </Question>
            <Question label="How are Kafka client credentials currently managed and distributed?" name="credentialManagement" type="select" value={formData.credentialManagement} onChange={handleChange}>
              <option value="secrets_manager">AWS Secrets Manager / Vault</option>
              <option value="env_vars">Environment Variables</option>
              <option value="direct_config">Directly in application config/code</option>
            </Question>
          </Section>

          {/* Ecosystem & Operational Tools */}
          <Section title="4. Ecosystem & Operational Tools">
            <Question label="Do you use a Schema Registry with MSK?" name="usesSchemaRegistry" type="select" value={formData.usesSchemaRegistry} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            {formData.usesSchemaRegistry === 'yes' && (
              <Question label="What type of Schema Registry?" name="schemaRegistryType" type="select" value={formData.schemaRegistryType} onChange={handleChange}>
                <option value="aws_glue">AWS Glue Schema Registry</option>
                <option value="confluent_platform">Confluent Platform (self-managed)</option>
                <option value="self_managed">Other self-managed</option>
              </Question>
            )}
            <Question label="Do you use Kafka Connect with MSK?" name="usesKafkaConnect" type="select" value={formData.usesKafkaConnect} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            {formData.usesKafkaConnect === 'yes' && (
              <Fragment>
                <Question label="What type of Kafka Connect deployment?" name="kafkaConnectType" type="select" value={formData.kafkaConnectType} onChange={handleChange}>
                  <option value="msk_connect">MSK Connect</option>
                  <option value="self_managed">Self-managed (EC2/Containers)</option>
                </Question>
                <Question label="How many Kafka Connect connectors are currently deployed?" name="numConnectors" type="number" value={formData.numConnectors} onChange={handleChange} min="0" />
              </Fragment>
            )}

            <Question label="Do you use ksqlDB with MSK?" name="usesKsqlDB" type="select" value={formData.usesKsqlDB} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="Do you use other stream processing frameworks (e.g., Kafka Streams, Spark Streaming) with MSK?" name="usesOtherStreamProcessing" type="select" value={formData.usesOtherStreamProcessing} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="What tools are used for monitoring MSK?" name="monitoringTools" type="select" value={formData.monitoringTools} onChange={handleChange}>
              <option value="cloudwatch">AWS CloudWatch (primary)</option>
              <option value="grafana_prometheus">Grafana/Prometheus</option>
              <option value="datadog_newrelic">Datadog/New Relic</option>
              <option value="custom">Custom/Multiple tools</option>
            </Question>
            <Question label="How are Kafka broker and application logs collected and analyzed?" name="loggingTools" type="select" value={formData.loggingTools} onChange={handleChange}>
              <option value="cloudwatch_logs">AWS CloudWatch Logs</option>
              <option value="splunk_elk">Splunk/ELK Stack</option>
              <option value="custom">Custom/Multiple tools</option>
            </Question>
            <Question label="Do you have custom automation scripts or tools for MSK operations (e.g., topic creation, ACL management)?" name="customMskAutomation" type="select" value={formData.customMskAutomation} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
          </Section>

          {/* Security & Governance */}
          <Section title="5. Security & Governance">
            <Question label="How are Kafka ACLs (Access Control Lists) currently managed on MSK?" name="aclManagement" type="select" value={formData.aclManagement} onChange={handleChange}>
              <option value="iam_policies">IAM Policies</option>
              <option value="kafka_cli">Kafka CLI/Admin API</option>
              <option value="manual">Manual/Ad-hoc</option>
            </Question>
            <Question label="How many distinct service accounts or users require access to Kafka topics?" name="numServiceAccounts" type="number" value={formData.numServiceAccounts} onChange={handleChange} min="1" />
            <Question label="What are the auditing requirements for Kafka interactions?" name="auditingRequirements" type="select" value={formData.auditingRequirements} onChange={handleChange}>
              <option value="basic">Basic (Standard logs)</option>
              <option value="strict">Strict (Detailed, immutable audit trails)</option>
            </Question>
            <Question label="Are there any specific regulatory compliance requirements (e.g., HIPAA, PCI DSS, GDPR) that apply to Kafka data?" name="complianceRequirements" type="select" value={formData.complianceRequirements} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="Do you require customer-managed encryption keys (CMKs) for data at rest?" name="customKeyEncryption" type="select" value={formData.customKeyEncryption} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
          </Section>
        </form>

        {/* Results Section */}
        <div className="mt-10 p-6 bg-indigo-50 rounded-xl shadow-inner border border-indigo-200">
          <h2 className="text-2xl font-bold text-indigo-800 mb-4">Migration Effort Estimate</h2>
          <div className="flex flex-col sm:flex-row justify-between items-center mb-6">
            <p className="text-xl font-semibold text-gray-700">Overall Estimated Effort:</p>
            <span className={`text-3xl font-extrabold px-4 py-2 rounded-lg ${
              effortLevel === 'Low Effort' ? 'bg-green-200 text-green-800' :
              effortLevel === 'Medium Effort' ? 'bg-yellow-200 text-yellow-800' :
              effortLevel === 'High Effort' ? 'bg-orange-200 text-orange-800' :
              'bg-red-200 text-red-800'
            }`}>
              {effortLevel}
            </span>
          </div>
          <p className="text-lg text-gray-700 mb-4">Total Complexity Score: <span className="font-bold">{totalScore}</span></p>

          <h3 className="text-xl font-semibold text-indigo-700 mb-3">Complexity Breakdown by Category:</h3>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            {Object.entries(categoryScores).map(([category, score]) => (
              <li key={category} className="flex justify-between items-center">
                <span className="capitalize font-medium">{category.replace(/([A-Z])/g, ' $1').trim()}:</span>
                <span className="font-bold text-lg">{score}</span>
              </li>
            ))}
          </ul>

          <h3 className="text-xl font-semibold text-indigo-700 mt-6 mb-3">Key Recommendations:</h3>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            {getRecommendations.map((rec, index) => (
              <li key={index} dangerouslySetInnerHTML={{ __html: rec }} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

// Helper Components for better readability
const Section = ({ title, children }) => (
  <div className="bg-gray-50 p-6 rounded-lg shadow-sm border border-gray-200">
    <h2 className="text-xl font-bold text-indigo-600 mb-5">{title}</h2>
    <div className="space-y-5">
      {children}
    </div>
  </div>
);

const Question = ({ label, name, type, value, onChange, children, min }) => (
  <div>
    <label htmlFor={name} className="block text-md font-medium text-gray-700 mb-2">
      {label}
    </label>
    {type === 'select' ? (
      <select
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm"
      >
        {children}
      </select>
    ) : (
      <input
        type={type}
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        min={min}
        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2"
      />
    )}
  </div>
);

console.log('Registering App component globally...');
window.App = App;
console.log('MSK Migration Estimator loaded successfully');
