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

    // Network & Connectivity
    networkType: 'public',
    vpcPeeringRequired: 'no',
    privateLinkRequired: 'no',
    crossRegionReplication: 'no',
    networkBandwidth: 'medium',
    networkLatency: 'medium',
    networkSecurityGroups: 'basic',

    // Performance & Scaling
    peakThroughput: 'medium',
    messageSize: 'small',
    retentionPeriod: '7_days',
    autoScaling: 'no',
    partitionScaling: 'manual',
    brokerScaling: 'manual',

    // Disaster Recovery & High Availability
    drStrategy: 'none',
    backupFrequency: 'none',
    backupRetention: 'none',
    failoverTime: 'none',
    multiRegion: 'no',
    replicationFactor: '3',

    // Cost Analysis & Optimization
    currentMskCost: 'unknown',
    costOptimization: 'no',
    reservedPricing: 'no',
    dataRetention: 'standard',
    storageType: 'standard',

    // Target State
    targetClusterType: 'dedicated',
    targetRegion: 'same',
    targetEnvironment: 'production',
    targetSecurityModel: 'rbac',
    targetMonitoring: 'confluent_cloud',
    targetLogging: 'confluent_cloud',
    targetAutomation: 'terraform',
    targetCompliance: 'none',

    // Migration Goals
    primaryGoal: 'cost_reduction',
    secondaryGoals: [],
    timelineConstraint: 'flexible',
    budgetConstraint: 'flexible',
    riskTolerance: 'medium',
    successCriteria: 'basic',
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  // Add function to handle multiple selections
  const handleMultiSelect = (name, value) => {
    setFormData(prevData => ({
      ...prevData,
      [name]: prevData[name].includes(value)
        ? prevData[name].filter(item => item !== value)
        : [...prevData[name], value]
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
      network: 0,
      performance: 0,
      dr: 0,
      cost: 0,
      targetState: 0,
      goals: 0
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

    // --- Network & Connectivity ---
    if (formData.networkType === 'private' || formData.networkType === 'hybrid') categoryScores.network += 3;
    
    if (formData.vpcPeeringRequired === 'yes') categoryScores.network += 2;
    if (formData.privateLinkRequired === 'yes') categoryScores.network += 2;
    if (formData.crossRegionReplication === 'yes') categoryScores.network += 3;

    if (formData.networkBandwidth === 'high') categoryScores.network += 3;
    else if (formData.networkBandwidth === 'medium') categoryScores.network += 2;

    if (formData.networkLatency === 'low') categoryScores.network += 3;
    else if (formData.networkLatency === 'medium') categoryScores.network += 2;

    if (formData.networkSecurityGroups === 'strict') categoryScores.network += 3;
    else if (formData.networkSecurityGroups === 'advanced') categoryScores.network += 2;

    // --- Performance & Scaling ---
    if (formData.peakThroughput === 'high') categoryScores.performance += 4;
    else if (formData.peakThroughput === 'medium') categoryScores.performance += 2;

    if (formData.messageSize === 'large') categoryScores.performance += 2;

    if (formData.retentionPeriod === '90_days' || formData.retentionPeriod === 'custom') categoryScores.performance += 3;
    else if (formData.retentionPeriod === '30_days') categoryScores.performance += 2;

    if (formData.autoScaling === 'yes') categoryScores.performance += 3;

    if (formData.partitionScaling === 'automatic') categoryScores.performance += 2;
    if (formData.brokerScaling === 'automatic') categoryScores.performance += 2;

    // --- Disaster Recovery & High Availability ---
    if (formData.drStrategy === 'active_active') categoryScores.dr += 5;
    else if (formData.drStrategy === 'active_passive') categoryScores.dr += 3;
    else if (formData.drStrategy === 'basic') categoryScores.dr += 2;

    if (formData.backupFrequency === 'daily') categoryScores.dr += 3;
    else if (formData.backupFrequency === 'weekly') categoryScores.dr += 2;

    if (formData.backupRetention === '90_days' || formData.backupRetention === 'custom') categoryScores.dr += 3;
    else if (formData.backupRetention === '30_days') categoryScores.dr += 2;

    if (formData.failoverTime === 'minutes') categoryScores.dr += 4;
    else if (formData.failoverTime === 'hours') categoryScores.dr += 2;

    if (formData.multiRegion === 'yes') categoryScores.dr += 4;

    if (formData.replicationFactor === '3') categoryScores.dr += 2;
    else if (formData.replicationFactor === 'custom') categoryScores.dr += 3;

    // --- Cost Analysis & Optimization ---
    if (formData.currentMskCost === 'high') categoryScores.cost += 3;
    else if (formData.currentMskCost === 'medium') categoryScores.cost += 2;

    if (formData.costOptimization === 'yes') categoryScores.cost += 2;
    if (formData.reservedPricing === 'yes') categoryScores.cost += 2;

    if (formData.dataRetention === 'extended') categoryScores.cost += 3;
    else if (formData.dataRetention === 'custom') categoryScores.cost += 2;

    if (formData.storageType === 'performance') categoryScores.cost += 2;
    else if (formData.storageType === 'custom') categoryScores.cost += 3;

    // --- Target State ---
    if (formData.targetClusterType === 'dedicated') categoryScores.targetState += 3;
    else if (formData.targetClusterType === 'standard') categoryScores.targetState += 2;

    if (formData.targetRegion === 'multi') categoryScores.targetState += 4;
    else if (formData.targetRegion === 'different') categoryScores.targetState += 2;

    if (formData.targetEnvironment === 'multi') categoryScores.targetState += 3;

    if (formData.targetSecurityModel === 'hybrid') categoryScores.targetState += 3;
    else if (formData.targetSecurityModel === 'rbac') categoryScores.targetState += 2;

    if (formData.targetMonitoring === 'hybrid' || formData.targetMonitoring === 'custom') categoryScores.targetState += 2;
    if (formData.targetLogging === 'hybrid' || formData.targetLogging === 'custom') categoryScores.targetState += 2;

    if (formData.targetAutomation === 'custom') categoryScores.targetState += 3;
    else if (formData.targetAutomation === 'terraform' || formData.targetAutomation === 'ansible') categoryScores.targetState += 2;

    if (formData.targetCompliance === 'advanced') categoryScores.targetState += 4;
    else if (formData.targetCompliance === 'basic') categoryScores.targetState += 2;

    // --- Migration Goals ---
    if (formData.primaryGoal === 'security' || formData.primaryGoal === 'reliability') categoryScores.goals += 3;
    else if (formData.primaryGoal === 'scalability') categoryScores.goals += 2;

    // Add points for each secondary goal
    categoryScores.goals += formData.secondaryGoals.length;

    if (formData.timelineConstraint === 'strict') categoryScores.goals += 4;
    else if (formData.timelineConstraint === 'moderate') categoryScores.goals += 2;

    if (formData.budgetConstraint === 'strict') categoryScores.goals += 3;
    else if (formData.budgetConstraint === 'moderate') categoryScores.goals += 2;

    if (formData.riskTolerance === 'low') categoryScores.goals += 3;
    else if (formData.riskTolerance === 'high') categoryScores.goals += 2;

    if (formData.successCriteria === 'comprehensive') categoryScores.goals += 3;
    else if (formData.successCriteria === 'enhanced') categoryScores.goals += 2;

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
            case 'network':
              categoryName = 'Network & Connectivity';
              if (formData.networkType === 'private' || formData.networkType === 'hybrid') specificRecs.push("Plan for private network connectivity using AWS PrivateLink or VPC Peering with Confluent Cloud.");
              if (formData.vpcPeeringRequired === 'yes' || formData.privateLinkRequired === 'yes') specificRecs.push("Ensure proper network configuration and security groups are in place for private connectivity.");
              if (formData.crossRegionReplication === 'yes') specificRecs.push("Design and implement cross-region replication strategy using Confluent Cloud's multi-region capabilities.");
              if (formData.networkBandwidth === 'high' || formData.networkLatency === 'low') specificRecs.push("Consider dedicated network connectivity options for high bandwidth/low latency requirements.");
              break;
            case 'performance':
              categoryName = 'Performance & Scaling';
              if (formData.peakThroughput === 'high') specificRecs.push("Plan for appropriate cluster sizing and consider dedicated clusters for high-throughput workloads.");
              if (formData.messageSize === 'large') specificRecs.push("Optimize message size and consider compression for large messages.");
              if (formData.retentionPeriod === '90_days' || formData.retentionPeriod === 'custom') specificRecs.push("Plan for appropriate storage capacity and consider tiered storage options.");
              if (formData.autoScaling === 'yes') specificRecs.push("Implement and test auto-scaling policies for both partitions and brokers.");
              break;
            case 'dr':
              categoryName = 'Disaster Recovery & High Availability';
              if (formData.drStrategy === 'active_active') specificRecs.push("Implement active-active replication across regions using Confluent Cloud's multi-region capabilities.");
              if (formData.drStrategy === 'active_passive') specificRecs.push("Set up active-passive replication with appropriate failover procedures.");
              if (formData.backupFrequency === 'daily' || formData.backupFrequency === 'weekly') specificRecs.push("Implement regular backup procedures and test restore processes.");
              if (formData.failoverTime === 'minutes') specificRecs.push("Design and test rapid failover procedures with minimal data loss.");
              if (formData.multiRegion === 'yes') specificRecs.push("Plan for multi-region deployment and ensure proper replication configuration.");
              break;
            case 'cost':
              categoryName = 'Cost Analysis & Optimization';
              if (formData.currentMskCost === 'high') specificRecs.push("Analyze current MSK costs and compare with Confluent Cloud pricing to identify optimization opportunities.");
              if (formData.costOptimization === 'yes') specificRecs.push("Implement cost optimization strategies such as appropriate cluster sizing and storage tiering.");
              if (formData.reservedPricing === 'yes') specificRecs.push("Consider reserved pricing options for predictable workloads.");
              if (formData.dataRetention === 'extended') specificRecs.push("Implement tiered storage strategy for cost-effective long-term data retention.");
              break;
            case 'targetState':
              categoryName = 'Target State';
              if (formData.targetClusterType === 'dedicated') specificRecs.push("Consider using a dedicated Confluent Cloud cluster for better performance and security.");
              if (formData.targetRegion === 'multi') specificRecs.push("Plan for multi-region deployment to improve availability and reduce latency.");
              if (formData.targetEnvironment === 'multi') specificRecs.push("Consider deploying to multiple environments to support different use cases.");
              if (formData.targetSecurityModel === 'hybrid') specificRecs.push("Consider using a hybrid security model to balance RBAC and ACL control.");
              if (formData.targetMonitoring === 'hybrid' || formData.targetMonitoring === 'custom') specificRecs.push("Consider using a hybrid monitoring approach to integrate with existing tools.");
              if (formData.targetLogging === 'hybrid' || formData.targetLogging === 'custom') specificRecs.push("Consider using a hybrid logging approach to integrate with existing tools.");
              if (formData.targetAutomation === 'custom') specificRecs.push("Consider using custom automation scripts or tools for better integration.");
              if (formData.targetCompliance === 'advanced') specificRecs.push("Ensure Confluent Cloud's compliance certifications meet your regulatory needs.");
              break;
            case 'goals':
              categoryName = 'Migration Goals';
              if (formData.primaryGoal === 'security' || formData.primaryGoal === 'reliability') specificRecs.push("Focus on improving security and reliability in the migration.");
              if (formData.primaryGoal === 'scalability') specificRecs.push("Focus on improving scalability in the migration.");
              if (formData.timelineConstraint === 'strict') specificRecs.push("Consider extending the timeline if possible, or ensure sufficient dedicated resources for a rapid migration.");
              if (formData.budgetConstraint === 'strict') specificRecs.push("Consider implementing cost-effective strategies for the migration.");
              if (formData.riskTolerance === 'low') specificRecs.push("Consider implementing risk-mitigation strategies in the migration.");
              if (formData.successCriteria === 'comprehensive') specificRecs.push("Focus on achieving full optimization in the migration.");
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

  // Add PDF generation function
  const generatePDF = () => {
    const element = document.getElementById('results-section');
    if (!element) {
      console.error('Results section not found');
      return;
    }

    // Create a new window for PDF content
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      console.error('Could not open print window');
      return;
    }

    // Write the content to the new window
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>MSK Migration Estimate</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              color: #333;
            }
            h2 { color: #0A3D62; }
            h3 { color: #0A3D62; margin-top: 20px; }
            .section { margin-bottom: 20px; }
            .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
            .card { 
              border: 1px solid #ddd;
              padding: 15px;
              border-radius: 8px;
              background: #fff;
            }
            .card h4 { color: #0A3D62; margin-top: 0; }
            ul { margin-left: 20px; }
            li { margin-bottom: 5px; }
            .score { font-weight: bold; }
            .recommendation { margin-bottom: 10px; }
          </style>
        </head>
        <body>
          ${element.innerHTML}
        </body>
      </html>
    `);

    // Wait for content to load
    printWindow.document.close();
    printWindow.focus();

    // Print to PDF
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  return (
    <div className="min-h-screen p-4 sm:p-8 font-sans text-[#0A3D62]">
      <div className="max-w-4xl mx-auto shadow-lg rounded-xl p-6 sm:p-8">

        <p className="text-center text-[#0A3D62] mb-8">
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

          {/* Network & Connectivity */}
          <Section title="6. Network & Connectivity">
            <Question label="What type of network connectivity do you require?" name="networkType" type="select" value={formData.networkType} onChange={handleChange}>
              <option value="public">Public Internet</option>
              <option value="private">Private Network</option>
              <option value="hybrid">Hybrid (Both)</option>
            </Question>
            <Question label="Is VPC Peering required for Confluent Cloud connectivity?" name="vpcPeeringRequired" type="select" value={formData.vpcPeeringRequired} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="Is AWS PrivateLink required for Confluent Cloud connectivity?" name="privateLinkRequired" type="select" value={formData.privateLinkRequired} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="Do you require cross-region replication?" name="crossRegionReplication" type="select" value={formData.crossRegionReplication} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="What is your expected network bandwidth requirement?" name="networkBandwidth" type="select" value={formData.networkBandwidth} onChange={handleChange}>
              <option value="low">Low ({'<'} 10 Mbps)</option>
              <option value="medium">Medium (10-100 Mbps)</option>
              <option value="high">High ({'>'} 100 Mbps)</option>
            </Question>
            <Question label="What are your network latency requirements?" name="networkLatency" type="select" value={formData.networkLatency} onChange={handleChange}>
              <option value="low">Low ({'<'} 10ms)</option>
              <option value="medium">Medium (10-50ms)</option>
              <option value="high">High ({'>'} 50ms)</option>
            </Question>
            <Question label="What level of network security group configuration do you require?" name="networkSecurityGroups" type="select" value={formData.networkSecurityGroups} onChange={handleChange}>
              <option value="basic">Basic (Default)</option>
              <option value="advanced">Advanced (Custom)</option>
              <option value="strict">Strict (Highly restricted)</option>
            </Question>
          </Section>

          {/* Performance & Scaling */}
          <Section title="7. Performance & Scaling">
            <Question label="What is your expected peak throughput?" name="peakThroughput" type="select" value={formData.peakThroughput} onChange={handleChange}>
              <option value="low">Low ({'<'} 1 MB/s)</option>
              <option value="medium">Medium (1-10 MB/s)</option>
              <option value="high">High ({'>'} 10 MB/s)</option>
            </Question>
            <Question label="What is your typical message size?" name="messageSize" type="select" value={formData.messageSize} onChange={handleChange}>
              <option value="small">Small ({'<'} 1KB)</option>
              <option value="medium">Medium (1-10KB)</option>
              <option value="large">Large ({'>'} 10KB)</option>
            </Question>
            <Question label="What is your data retention period requirement?" name="retentionPeriod" type="select" value={formData.retentionPeriod} onChange={handleChange}>
              <option value="1_day">1 Day</option>
              <option value="7_days">7 Days</option>
              <option value="30_days">30 Days</option>
              <option value="90_days">90 Days</option>
              <option value="custom">Custom</option>
            </Question>
            <Question label="Do you require automatic scaling?" name="autoScaling" type="select" value={formData.autoScaling} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="How do you handle partition scaling?" name="partitionScaling" type="select" value={formData.partitionScaling} onChange={handleChange}>
              <option value="manual">Manual</option>
              <option value="scheduled">Scheduled</option>
              <option value="automatic">Automatic</option>
            </Question>
            <Question label="How do you handle broker scaling?" name="brokerScaling" type="select" value={formData.brokerScaling} onChange={handleChange}>
              <option value="manual">Manual</option>
              <option value="scheduled">Scheduled</option>
              <option value="automatic">Automatic</option>
            </Question>
          </Section>

          {/* Disaster Recovery & High Availability */}
          <Section title="8. Disaster Recovery & High Availability">
            <Question label="What is your DR strategy?" name="drStrategy" type="select" value={formData.drStrategy} onChange={handleChange}>
              <option value="none">None</option>
              <option value="basic">Basic (Backup & Restore)</option>
              <option value="active_passive">Active-Passive</option>
              <option value="active_active">Active-Active</option>
            </Question>
            <Question label="What is your backup frequency requirement?" name="backupFrequency" type="select" value={formData.backupFrequency} onChange={handleChange}>
              <option value="none">None</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="custom">Custom</option>
            </Question>
            <Question label="What is your backup retention requirement?" name="backupRetention" type="select" value={formData.backupRetention} onChange={handleChange}>
              <option value="none">None</option>
              <option value="7_days">7 Days</option>
              <option value="30_days">30 Days</option>
              <option value="90_days">90 Days</option>
              <option value="custom">Custom</option>
            </Question>
            <Question label="What is your acceptable failover time?" name="failoverTime" type="select" value={formData.failoverTime} onChange={handleChange}>
              <option value="none">None</option>
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
              <option value="days">Days</option>
            </Question>
            <Question label="Do you require multi-region deployment?" name="multiRegion" type="select" value={formData.multiRegion} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="What replication factor do you require?" name="replicationFactor" type="select" value={formData.replicationFactor} onChange={handleChange}>
              <option value="1">1 (No replication)</option>
              <option value="2">2</option>
              <option value="3">3 (Recommended)</option>
              <option value="custom">Custom</option>
            </Question>
          </Section>

          {/* Cost Analysis & Optimization */}
          <Section title="9. Cost Analysis & Optimization">
            <Question label="What is your current MSK cost per month?" name="currentMskCost" type="select" value={formData.currentMskCost} onChange={handleChange}>
              <option value="unknown">Unknown</option>
              <option value="low">{'<'} $1,000</option>
              <option value="medium">$1,000 - $5,000</option>
              <option value="high">{'>'} $5,000</option>
            </Question>
            <Question label="Do you require cost optimization strategies?" name="costOptimization" type="select" value={formData.costOptimization} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="Are you interested in reserved pricing?" name="reservedPricing" type="select" value={formData.reservedPricing} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="What is your data retention strategy?" name="dataRetention" type="select" value={formData.dataRetention} onChange={handleChange}>
              <option value="standard">Standard (7 days)</option>
              <option value="extended">Extended (30+ days)</option>
              <option value="minimal">Minimal (1-3 days)</option>
              <option value="custom">Custom</option>
            </Question>
            <Question label="What type of storage do you require?" name="storageType" type="select" value={formData.storageType} onChange={handleChange}>
              <option value="standard">Standard</option>
              <option value="performance">Performance</option>
              <option value="custom">Custom</option>
            </Question>
          </Section>

          {/* Target State */}
          <Section title="10. Target State">
            <Question label="What type of Confluent Cloud cluster do you plan to use?" name="targetClusterType" type="select" value={formData.targetClusterType} onChange={handleChange}>
              <option value="dedicated">Dedicated</option>
              <option value="standard">Standard</option>
              <option value="basic">Basic</option>
              <option value="custom">Custom</option>
            </Question>
            <Question label="Where will your target Confluent Cloud cluster be located?" name="targetRegion" type="select" value={formData.targetRegion} onChange={handleChange}>
              <option value="same">Same as current MSK region</option>
              <option value="different">Different region</option>
              <option value="multi">Multi-region</option>
            </Question>
            <Question label="What is the target environment type?" name="targetEnvironment" type="select" value={formData.targetEnvironment} onChange={handleChange}>
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="development">Development</option>
              <option value="multi">Multiple environments</option>
            </Question>
            <Question label="What security model will you use in Confluent Cloud?" name="targetSecurityModel" type="select" value={formData.targetSecurityModel} onChange={handleChange}>
              <option value="rbac">RBAC (Role-Based Access Control)</option>
              <option value="acl">ACL (Access Control Lists)</option>
              <option value="hybrid">Hybrid (RBAC + ACL)</option>
            </Question>
            <Question label="What monitoring solution will you use?" name="targetMonitoring" type="select" value={formData.targetMonitoring} onChange={handleChange}>
              <option value="confluent_cloud">Confluent Cloud Monitoring</option>
              <option value="custom">Custom Solution</option>
              <option value="hybrid">Hybrid Approach</option>
            </Question>
            <Question label="What logging solution will you use?" name="targetLogging" type="select" value={formData.targetLogging} onChange={handleChange}>
              <option value="confluent_cloud">Confluent Cloud Logging</option>
              <option value="custom">Custom Solution</option>
              <option value="hybrid">Hybrid Approach</option>
            </Question>
            <Question label="What automation approach will you use?" name="targetAutomation" type="select" value={formData.targetAutomation} onChange={handleChange}>
              <option value="terraform">Terraform</option>
              <option value="ansible">Ansible</option>
              <option value="custom">Custom Scripts</option>
              <option value="none">No Automation</option>
            </Question>
            <Question label="What compliance requirements need to be met?" name="targetCompliance" type="select" value={formData.targetCompliance} onChange={handleChange}>
              <option value="none">None</option>
              <option value="basic">Basic (SOC 2)</option>
              <option value="advanced">Advanced (HIPAA, PCI)</option>
              <option value="custom">Custom Requirements</option>
            </Question>
          </Section>

          {/* Migration Goals */}
          <Section title="11. Migration Goals">
            <Question label="What is your primary migration goal?" name="primaryGoal" type="select" value={formData.primaryGoal} onChange={handleChange}>
              <option value="cost_reduction">Cost Reduction</option>
              <option value="simplified_ops">Simplified Operations</option>
              <option value="better_features">Better Features</option>
              <option value="scalability">Improved Scalability</option>
              <option value="reliability">Enhanced Reliability</option>
              <option value="security">Improved Security</option>
            </Question>
            <div className="space-y-2">
              <label className="block text-md font-medium text-gray-700 mb-2">
                Select secondary goals (multiple):
              </label>
              <div className="grid grid-cols-2 gap-2">
                {['cost_reduction', 'simplified_ops', 'better_features', 'scalability', 'reliability', 'security'].map(goal => (
                  <label key={goal} className="inline-flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.secondaryGoals.includes(goal)}
                      onChange={() => handleMultiSelect('secondaryGoals', goal)}
                      className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      {goal.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <Question label="What are your timeline constraints?" name="timelineConstraint" type="select" value={formData.timelineConstraint} onChange={handleChange}>
              <option value="flexible">Flexible</option>
              <option value="moderate">Moderate (3-6 months)</option>
              <option value="strict">Strict ({'<'} 3 months)</option>
            </Question>
            <Question label="What are your budget constraints?" name="budgetConstraint" type="select" value={formData.budgetConstraint} onChange={handleChange}>
              <option value="flexible">Flexible</option>
              <option value="moderate">Moderate</option>
              <option value="strict">Strict</option>
            </Question>
            <Question label="What is your risk tolerance?" name="riskTolerance" type="select" value={formData.riskTolerance} onChange={handleChange}>
              <option value="low">Low (Minimal Risk)</option>
              <option value="medium">Medium (Balanced)</option>
              <option value="high">High (Aggressive)</option>
            </Question>
            <Question label="What are your success criteria?" name="successCriteria" type="select" value={formData.successCriteria} onChange={handleChange}>
              <option value="basic">Basic (Successful Migration)</option>
              <option value="enhanced">Enhanced (Improved Performance)</option>
              <option value="comprehensive">Comprehensive (Full Optimization)</option>
            </Question>
          </Section>
        </form>

        {/* Results Section */}
        <div className="mt-10 p-6 bg-indigo-50 rounded-xl shadow-inner border border-indigo-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-indigo-800">Migration Effort Estimate</h2>
            <button
              onClick={generatePDF}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors duration-200 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd" />
              </svg>
              Download PDF
            </button>
          </div>
          <div id="results-section">
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

            <h3 className="text-xl font-semibold text-indigo-700 mb-3">Selected Configuration:</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* General & Scope */}
              <div className="bg-white p-4 rounded-lg shadow">
                <h4 className="font-bold text-indigo-600 mb-2">1. General & Scope</h4>
                <ul className="space-y-1 text-sm">
                  <li><span className="font-medium">Number of MSK Clusters:</span> {formData.numMskClusters}</li>
                  <li><span className="font-medium">Desired Timeline:</span> {formData.desiredTimeline.replace(/_/g, ' ')}</li>
                  <li><span className="font-medium">Strict NFRs:</span> {formData.hasStrictNFRs === 'yes' ? 'Yes' : 'No'}</li>
                  <li><span className="font-medium">Team Kafka Experience:</span> {formData.teamKafkaExperience.charAt(0).toUpperCase() + formData.teamKafkaExperience.slice(1)}</li>
                  <li><span className="font-medium">Dedicated Migration Team:</span> {formData.dedicatedMigrationTeam === 'yes' ? 'Yes' : 'No'}</li>
                </ul>
              </div>

              {/* Kafka Core */}
              <div className="bg-white p-4 rounded-lg shadow">
                <h4 className="font-bold text-indigo-600 mb-2">2. Kafka Core & Data Migration</h4>
                <ul className="space-y-1 text-sm">
                  <li><span className="font-medium">Number of Topics:</span> {formData.numTopics}</li>
                  <li><span className="font-medium">Number of Partitions:</span> {formData.numPartitions}</li>
                  <li><span className="font-medium">Complex Topic Configs:</span> {formData.hasComplexTopicConfigs === 'yes' ? 'Yes' : 'No'}</li>
                  <li><span className="font-medium">Historical Data Migration:</span> {formData.historicalDataMigration.charAt(0).toUpperCase() + formData.historicalDataMigration.slice(1)}</li>
                  <li><span className="font-medium">Acceptable Downtime:</span> {formData.acceptableDowntime.charAt(0).toUpperCase() + formData.acceptableDowntime.slice(1)}</li>
                  <li><span className="font-medium">Data Migration Tool:</span> {formData.preferredDataMigrationTool.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</li>
                  <li><span className="font-medium">Number of Consumer Groups:</span> {formData.numConsumerGroups}</li>
                  <li><span className="font-medium">Offset Migration Required:</span> {formData.offsetMigrationRequired === 'yes' ? 'Yes' : 'No'}</li>
                </ul>
              </div>

              {/* Applications */}
              <div className="bg-white p-4 rounded-lg shadow">
                <h4 className="font-bold text-indigo-600 mb-2">3. Applications & Connectivity</h4>
                <ul className="space-y-1 text-sm">
                  <li><span className="font-medium">Number of Applications:</span> {formData.numApplications}</li>
                  <li><span className="font-medium">Diverse Languages:</span> {formData.diverseLanguages === 'yes' ? 'Yes' : 'No'}</li>
                  <li><span className="font-medium">MSK Authentication:</span> {formData.mskAuthentication.toUpperCase()}</li>
                  <li><span className="font-medium">Private Connectivity Required:</span> {formData.privateConnectivityRequired === 'yes' ? 'Yes' : 'No'}</li>
                  <li><span className="font-medium">Credential Management:</span> {formData.credentialManagement.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</li>
                </ul>
              </div>

              {/* Ecosystem */}
              <div className="bg-white p-4 rounded-lg shadow">
                <h4 className="font-bold text-indigo-600 mb-2">4. Ecosystem & Tools</h4>
                <ul className="space-y-1 text-sm">
                  <li><span className="font-medium">Schema Registry:</span> {formData.usesSchemaRegistry === 'yes' ? 'Yes' : 'No'}</li>
                  {formData.usesSchemaRegistry === 'yes' && (
                    <li><span className="font-medium">Schema Registry Type:</span> {formData.schemaRegistryType.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</li>
                  )}
                  <li><span className="font-medium">Kafka Connect:</span> {formData.usesKafkaConnect === 'yes' ? 'Yes' : 'No'}</li>
                  {formData.usesKafkaConnect === 'yes' && (
                    <>
                      <li><span className="font-medium">Connect Type:</span> {formData.kafkaConnectType.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</li>
                      <li><span className="font-medium">Number of Connectors:</span> {formData.numConnectors}</li>
                    </>
                  )}
                  <li><span className="font-medium">ksqlDB:</span> {formData.usesKsqlDB === 'yes' ? 'Yes' : 'No'}</li>
                  <li><span className="font-medium">Other Stream Processing:</span> {formData.usesOtherStreamProcessing === 'yes' ? 'Yes' : 'No'}</li>
                  <li><span className="font-medium">Monitoring Tools:</span> {formData.monitoringTools.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</li>
                  <li><span className="font-medium">Logging Tools:</span> {formData.loggingTools.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</li>
                  <li><span className="font-medium">Custom MSK Automation:</span> {formData.customMskAutomation === 'yes' ? 'Yes' : 'No'}</li>
                </ul>
              </div>

              {/* Security */}
              <div className="bg-white p-4 rounded-lg shadow">
                <h4 className="font-bold text-indigo-600 mb-2">5. Security & Governance</h4>
                <ul className="space-y-1 text-sm">
                  <li><span className="font-medium">ACL Management:</span> {formData.aclManagement.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</li>
                  <li><span className="font-medium">Number of Service Accounts:</span> {formData.numServiceAccounts}</li>
                  <li><span className="font-medium">Auditing Requirements:</span> {formData.auditingRequirements.charAt(0).toUpperCase() + formData.auditingRequirements.slice(1)}</li>
                  <li><span className="font-medium">Compliance Requirements:</span> {formData.complianceRequirements === 'yes' ? 'Yes' : 'No'}</li>
                  <li><span className="font-medium">Custom Key Encryption:</span> {formData.customKeyEncryption === 'yes' ? 'Yes' : 'No'}</li>
                </ul>
              </div>

              {/* Network */}
              <div className="bg-white p-4 rounded-lg shadow">
                <h4 className="font-bold text-indigo-600 mb-2">6. Network & Connectivity</h4>
                <ul className="space-y-1 text-sm">
                  <li><span className="font-medium">Network Type:</span> {formData.networkType.charAt(0).toUpperCase() + formData.networkType.slice(1)}</li>
                  <li><span className="font-medium">VPC Peering Required:</span> {formData.vpcPeeringRequired === 'yes' ? 'Yes' : 'No'}</li>
                  <li><span className="font-medium">PrivateLink Required:</span> {formData.privateLinkRequired === 'yes' ? 'Yes' : 'No'}</li>
                  <li><span className="font-medium">Cross-Region Replication:</span> {formData.crossRegionReplication === 'yes' ? 'Yes' : 'No'}</li>
                  <li><span className="font-medium">Network Bandwidth:</span> {formData.networkBandwidth.charAt(0).toUpperCase() + formData.networkBandwidth.slice(1)}</li>
                  <li><span className="font-medium">Network Latency:</span> {formData.networkLatency.charAt(0).toUpperCase() + formData.networkLatency.slice(1)}</li>
                  <li><span className="font-medium">Network Security Groups:</span> {formData.networkSecurityGroups.charAt(0).toUpperCase() + formData.networkSecurityGroups.slice(1)}</li>
                </ul>
              </div>

              {/* Performance */}
              <div className="bg-white p-4 rounded-lg shadow">
                <h4 className="font-bold text-indigo-600 mb-2">7. Performance & Scaling</h4>
                <ul className="space-y-1 text-sm">
                  <li><span className="font-medium">Peak Throughput:</span> {formData.peakThroughput.charAt(0).toUpperCase() + formData.peakThroughput.slice(1)}</li>
                  <li><span className="font-medium">Message Size:</span> {formData.messageSize.charAt(0).toUpperCase() + formData.messageSize.slice(1)}</li>
                  <li><span className="font-medium">Retention Period:</span> {formData.retentionPeriod.replace(/_/g, ' ')}</li>
                  <li><span className="font-medium">Auto Scaling:</span> {formData.autoScaling === 'yes' ? 'Yes' : 'No'}</li>
                  <li><span className="font-medium">Partition Scaling:</span> {formData.partitionScaling.charAt(0).toUpperCase() + formData.partitionScaling.slice(1)}</li>
                  <li><span className="font-medium">Broker Scaling:</span> {formData.brokerScaling.charAt(0).toUpperCase() + formData.brokerScaling.slice(1)}</li>
                </ul>
              </div>

              {/* DR & HA */}
              <div className="bg-white p-4 rounded-lg shadow">
                <h4 className="font-bold text-indigo-600 mb-2">8. Disaster Recovery & HA</h4>
                <ul className="space-y-1 text-sm">
                  <li><span className="font-medium">DR Strategy:</span> {formData.drStrategy.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</li>
                  <li><span className="font-medium">Backup Frequency:</span> {formData.backupFrequency.charAt(0).toUpperCase() + formData.backupFrequency.slice(1)}</li>
                  <li><span className="font-medium">Backup Retention:</span> {formData.backupRetention.replace(/_/g, ' ')}</li>
                  <li><span className="font-medium">Failover Time:</span> {formData.failoverTime.charAt(0).toUpperCase() + formData.failoverTime.slice(1)}</li>
                  <li><span className="font-medium">Multi-Region:</span> {formData.multiRegion === 'yes' ? 'Yes' : 'No'}</li>
                  <li><span className="font-medium">Replication Factor:</span> {formData.replicationFactor}</li>
                </ul>
              </div>

              {/* Cost */}
              <div className="bg-white p-4 rounded-lg shadow">
                <h4 className="font-bold text-indigo-600 mb-2">9. Cost Analysis</h4>
                <ul className="space-y-1 text-sm">
                  <li><span className="font-medium">Current MSK Cost:</span> {formData.currentMskCost.charAt(0).toUpperCase() + formData.currentMskCost.slice(1)}</li>
                  <li><span className="font-medium">Cost Optimization:</span> {formData.costOptimization === 'yes' ? 'Yes' : 'No'}</li>
                  <li><span className="font-medium">Reserved Pricing:</span> {formData.reservedPricing === 'yes' ? 'Yes' : 'No'}</li>
                  <li><span className="font-medium">Data Retention:</span> {formData.dataRetention.charAt(0).toUpperCase() + formData.dataRetention.slice(1)}</li>
                  <li><span className="font-medium">Storage Type:</span> {formData.storageType.charAt(0).toUpperCase() + formData.storageType.slice(1)}</li>
                </ul>
              </div>

              {/* Target State */}
              <div className="bg-white p-4 rounded-lg shadow">
                <h4 className="font-bold text-indigo-600 mb-2">10. Target State</h4>
                <ul className="space-y-1 text-sm">
                  <li><span className="font-medium">Cluster Type:</span> {formData.targetClusterType.charAt(0).toUpperCase() + formData.targetClusterType.slice(1)}</li>
                  <li><span className="font-medium">Region:</span> {formData.targetRegion.charAt(0).toUpperCase() + formData.targetRegion.slice(1)}</li>
                  <li><span className="font-medium">Environment:</span> {formData.targetEnvironment.charAt(0).toUpperCase() + formData.targetEnvironment.slice(1)}</li>
                  <li><span className="font-medium">Security Model:</span> {formData.targetSecurityModel.toUpperCase()}</li>
                  <li><span className="font-medium">Monitoring:</span> {formData.targetMonitoring.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</li>
                  <li><span className="font-medium">Logging:</span> {formData.targetLogging.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</li>
                  <li><span className="font-medium">Automation:</span> {formData.targetAutomation.charAt(0).toUpperCase() + formData.targetAutomation.slice(1)}</li>
                  <li><span className="font-medium">Compliance:</span> {formData.targetCompliance.charAt(0).toUpperCase() + formData.targetCompliance.slice(1)}</li>
                </ul>
              </div>

              {/* Migration Goals */}
              <div className="bg-white p-4 rounded-lg shadow">
                <h4 className="font-bold text-indigo-600 mb-2">11. Migration Goals</h4>
                <ul className="space-y-1 text-sm">
                  <li><span className="font-medium">Primary Goal:</span> {formData.primaryGoal.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</li>
                  <li><span className="font-medium">Secondary Goals:</span> {formData.secondaryGoals.length > 0 ? formData.secondaryGoals.map(goal => goal.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')).join(', ') : 'None'}</li>
                  <li><span className="font-medium">Timeline Constraint:</span> {formData.timelineConstraint.charAt(0).toUpperCase() + formData.timelineConstraint.slice(1)}</li>
                  <li><span className="font-medium">Budget Constraint:</span> {formData.budgetConstraint.charAt(0).toUpperCase() + formData.budgetConstraint.slice(1)}</li>
                  <li><span className="font-medium">Risk Tolerance:</span> {formData.riskTolerance.charAt(0).toUpperCase() + formData.riskTolerance.slice(1)}</li>
                  <li><span className="font-medium">Success Criteria:</span> {formData.successCriteria.charAt(0).toUpperCase() + formData.successCriteria.slice(1)}</li>
                </ul>
              </div>
            </div>

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
    </div>
  );
};

// Helper Components for better readability
const Section = ({ title, children }) => (
  <div className="bg-gray-50 p-6 rounded-lg shadow-sm border border-gray-200">
    <h2 className="text-xl font-bold text-[#0A3D62] mb-5">{title}</h2>
    <div className="space-y-5">
      {children}
    </div>
  </div>
);

const Question = ({ label, name, type, value, onChange, children, min }) => (
  <div>
    <label htmlFor={name} className="block text-md font-medium text-[#0A3D62] mb-2">
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
