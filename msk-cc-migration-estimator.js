// Get React from the global scope
const { useState, useMemo, useEffect, Fragment, useRef } = React;

console.log('Loading MSK Migration Estimator...');

// Tailwind CSS is assumed to be available in the environment
const App = () => {
  console.log('Initializing App component...');
  
  const [formData, setFormData] = useState({
    // General & Scope
    numMskClusters: 1,
    currentMskVersion: '2.8.1',
    targetConfluentVersion: '7.5.0',
    numEnvironments: '1',
    desiredTimeline: '6-12_months',
    hasStrictNFRs: 'no',
    teamKafkaExperience: 'medium',
    dedicatedMigrationTeam: 'no',
    sectionNotes: {
      general: '',
      kafkaCore: '',
      applications: '',
      ecosystem: '',
      security: '',
      network: '',
      performance: '',
      dr: '',
      cost: '',
      targetState: '',
      goals: ''
    },

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

    // Encryption
    encryptionAtRest: 'kms',
    encryptionInTransit: 'tls',
    clientAuthentication: 'iam',
    authorizationMethod: 'acl',
    credentialManagement: 'secrets_manager',
    hasComplianceRequirements: 'no',
    auditLogging: 'cloudtrail',
    hasCustomSecurityPolicies: 'no',

    // Network & Connectivity
    networkTopology: 'single_vpc',
    securityGroups: 'default',
    bandwidthUsage: 'medium',
    usesVpcPeering: 'no',
    usesPrivateLink: 'no',
    hasCustomNetworkConfigs: 'no',
    latencyRequirement: 'medium',
    hasNetworkSecurityRequirements: 'no',

    // Performance & Scaling
    throughputRequirement: 'medium',
    performanceLatencyRequirement: 'medium',
    partitionCount: 'medium',
    brokerCount: 'medium',
    requiresAutoScaling: 'no',
    hasSpecificPerformanceRequirements: 'no',

    // Disaster Recovery & High Availability
    backupStrategy: 'none',
    rto: 'hours',
    rpo: 'hours',
    requiresMultiRegion: 'no',
    highAvailabilitySetup: 'none',
    hasDisasterRecoveryPlan: 'no',
    requiresAutomatedFailover: 'no',
    hasSpecificDRRequirements: 'no',

    // Cost Analysis & Optimization
    storageUsage: 'medium',
    networkUsage: 'medium',
    computeUsage: 'medium',
    currentMonthlyCost: 'medium',
    targetMonthlyCost: 'same',
    hasCostOptimizationRequirements: 'no',
    requiresCostAllocation: 'no',
    hasBudgetConstraints: 'no',

    // Target State
    targetClusterSize: 'small',
    targetTimeline: 'immediate',
    targetBudget: 'same',
    hasTargetStateRequirements: 'no',
    hasSpecificFeatureRequirements: 'no',
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleNotesChange = (section, value) => {
    setFormData(prevData => ({
      ...prevData,
      sectionNotes: {
        ...prevData.sectionNotes,
        [section]: value
      }
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
        `<div class="font-bold">Overall Estimated Effort: ${effortLevel}</div> (Total Score: ${totalScore}).`
      );
      recommendations.push('<div class="font-bold">Focus areas for de-risking and acceleration:</div>');

      sortedCategories.forEach(([category, score]) => {
        if (score > 10) { // Increased threshold for significant complexity in a category
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
            recommendations.push(`<div class="font-bold">${categoryName}</div> (Score: ${score}):`);
            specificRecs.forEach(rec => recommendations.push(`  - ${rec}`));
          }
        }
      });
    } else {
      recommendations.push('<div class="font-bold">This migration appears to be Low Effort.</div> Focus on standard best practices for connectivity, testing, and phased cutover.');
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

    // Helper function to format section titles
    const formatSectionTitle = (title) => {
      return title.split(/(?=[A-Z])/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };

    // Helper function to get section fields
    const getSectionFields = (section) => {
      const sectionMap = {
        general: ['numMskClusters', 'currentMskVersion', 'targetConfluentVersion', 'numEnvironments', 'desiredTimeline', 'hasStrictNFRs', 'teamKafkaExperience', 'dedicatedMigrationTeam'],
        kafkaCore: ['numTopics', 'numPartitions', 'hasComplexTopicConfigs', 'historicalDataMigration', 'acceptableDowntime', 'preferredDataMigrationTool', 'numConsumerGroups', 'offsetMigrationRequired'],
        applications: ['numApplications', 'diverseLanguages', 'mskAuthentication', 'privateConnectivityRequired', 'credentialManagement'],
        ecosystem: ['usesSchemaRegistry', 'schemaRegistryType', 'usesKafkaConnect', 'kafkaConnectType', 'numConnectors', 'usesKsqlDB', 'usesOtherStreamProcessing', 'monitoringTools', 'loggingTools', 'customMskAutomation'],
        security: ['aclManagement', 'numServiceAccounts', 'auditingRequirements', 'complianceRequirements', 'customKeyEncryption'],
        network: ['networkType', 'vpcPeeringRequired', 'privateLinkRequired', 'crossRegionReplication', 'networkBandwidth', 'networkLatency', 'networkSecurityGroups'],
        performance: ['peakThroughput', 'messageSize', 'retentionPeriod', 'autoScaling', 'partitionScaling', 'brokerScaling'],
        dr: ['drStrategy', 'backupFrequency', 'backupRetention', 'failoverTime', 'multiRegion', 'replicationFactor'],
        cost: ['currentMskCost', 'costOptimization', 'reservedPricing', 'dataRetention', 'storageType'],
        targetState: ['targetClusterType', 'targetRegion', 'targetEnvironment', 'targetSecurityModel', 'targetMonitoring', 'targetLogging', 'targetAutomation', 'targetCompliance'],
        goals: ['primaryGoal', 'secondaryGoals', 'timelineConstraint', 'budgetConstraint', 'riskTolerance', 'successCriteria']
      };

      return sectionMap[section] || [];
    };

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
              line-height: 1.6;
            }
            h1 { color: #0A3D62; text-align: center; margin-bottom: 30px; }
            h2 { color: #0A3D62; margin-top: 30px; border-bottom: 2px solid #0A3D62; padding-bottom: 5px; }
            h3 { color: #0A3D62; margin-top: 20px; }
            .section { 
              margin-bottom: 30px;
              page-break-inside: avoid;
            }
            .grid { 
              display: grid; 
              grid-template-columns: repeat(2, 1fr); 
              gap: 20px;
              margin-bottom: 20px;
            }
            .card { 
              border: 1px solid #ddd;
              padding: 15px;
              border-radius: 8px;
              background: #fff;
            }
            .card h4 { 
              color: #0A3D62; 
              margin-top: 0;
              border-bottom: 1px solid #eee;
              padding-bottom: 5px;
            }
            ul { margin-left: 20px; }
            li { margin-bottom: 8px; }
            .score { font-weight: bold; }
            .recommendation { margin-bottom: 10px; }
            .notes {
              margin-top: 10px;
              padding: 10px;
              background-color: #f8f9fa;
              border-left: 3px solid #0A3D62;
              font-style: italic;
            }
            .effort-level {
              text-align: center;
              font-size: 24px;
              font-weight: bold;
              padding: 10px;
              margin: 20px 0;
              border-radius: 8px;
            }
            .low-effort { background-color: #dcfce7; color: #166534; }
            .medium-effort { background-color: #fef9c3; color: #854d0e; }
            .high-effort { background-color: #ffedd5; color: #9a3412; }
            .very-high-effort { background-color: #fee2e2; color: #991b1b; }
          </style>
        </head>
        <body>
          <h1>MSK Migration Estimate Report</h1>
          
          <div class="effort-level ${effortLevel.toLowerCase().replace(' ', '-')}">
            Overall Estimated Effort: ${effortLevel}
          </div>
          
          <p style="text-align: center; font-size: 18px;">
            Total Complexity Score: <span class="score">${totalScore}</span>
          </p>

          <h2>Selected Configuration</h2>
          <div class="grid">
            ${Object.entries({
              general: '1. General & Scope',
              kafkaCore: '2. Kafka Core & Data Migration',
              applications: '3. Applications & Connectivity',
              ecosystem: '4. Ecosystem & Operational Tools',
              security: '5. Security & Governance',
              network: '6. Network & Connectivity',
              performance: '7. Performance & Scaling',
              dr: '8. Disaster Recovery & High Availability',
              cost: '9. Cost Analysis & Optimization',
              targetState: '10. Target State',
              goals: '11. Migration Goals'
            }).map(([section, title]) => {
              const fields = getSectionFields(section);
              const entries = fields.map(field => {
                const value = formData[field];
                const label = field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                return `<li><strong>${label}:</strong> ${Array.isArray(value) ? value.join(', ') : value}</li>`;
              }).join('');

              const notes = formData.sectionNotes && formData.sectionNotes[section];
              const notesHtml = notes ? `
                <div class="notes">
                  <strong>Additional Notes:</strong><br>
                  ${notes}
                </div>
              ` : '';

              return `
                <div class="card">
                  <h4>${title}</h4>
                  <ul>
                    ${entries}
                  </ul>
                  ${notesHtml}
                </div>
              `;
            }).join('')}
          </div>

          <h2>Complexity Breakdown</h2>
          <div class="bg-white p-4 rounded-lg shadow">
            <ul class="space-y-2">
              ${Object.entries(categoryScores).map(([category, score]) => `
                <li class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                  <span class="capitalize text-[#0A3D62]">${formatSectionTitle(category)}</span>
                  <span class="font-bold text-lg text-[#0A3D62]">${score}</span>
                </li>
              `).join('')}
            </ul>
          </div>

          <h2>Key Recommendations</h2>
          <div class="recommendations">
            ${getRecommendations.filter(rec => rec.trim() !== '').map(rec => `
              <div class="recommendation">${rec}</div>
            `).join('')}
          </div>
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

  // Helper Components for better readability
  const Section = ({ title, sectionKey, children }) => {
    const [localNotes, setLocalNotes] = useState(formData.sectionNotes[sectionKey] || '');
    const textareaRef = useRef(null);

    // Update local state when formData changes
    useEffect(() => {
      setLocalNotes(formData.sectionNotes[sectionKey] || '');
    }, [formData.sectionNotes[sectionKey]]);

    const handleNotesChange = (e) => {
      setLocalNotes(e.target.value);
    };

    const handleBlur = () => {
      setFormData(prevData => ({
        ...prevData,
        sectionNotes: {
          ...prevData.sectionNotes,
          [sectionKey]: localNotes
        }
      }));
    };

    return (
      <div className="bg-gray-50 p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-xl font-bold text-[#0A3D62] mb-5">{title}</h2>
        <div className="space-y-5">
          {children}
        </div>
        <div className="mt-6">
          <label htmlFor={`notes-${sectionKey}`} className="block text-md font-medium text-[#0A3D62] mb-2">
            Additional Notes (Optional)
          </label>
          <textarea
            ref={textareaRef}
            id={`notes-${sectionKey}`}
            value={localNotes}
            onChange={handleNotesChange}
            onBlur={handleBlur}
            placeholder="Add any additional notes or comments for this section..."
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 min-h-[100px]"
          />
        </div>
      </div>
    );
  };

  // Update the form sections to pass the required props
  return (
    <div className="min-h-screen p-4 sm:p-8 font-sans text-[#0A3D62]">
      <div className="max-w-4xl mx-auto shadow-lg rounded-xl p-6 sm:p-8">
        <form className="space-y-8">
          {/* General & Scope */}
          <Section 
            title="1. General & Scope" 
            sectionKey="general"
          >
            <Question label="How many AWS MSK clusters do you currently operate?" name="numMskClusters" type="number" value={formData.numMskClusters} onChange={handleChange} min="1" />
            <Question label="What is your current MSK version?" name="currentMskVersion" type="select" value={formData.currentMskVersion} onChange={handleChange}>
              <option value="2.8.1">2.8.1</option>
              <option value="2.7.0">2.7.0</option>
              <option value="2.6.2">2.6.2</option>
              <option value="2.5.1">2.5.1</option>
              <option value="2.4.1">2.4.1</option>
              <option value="2.3.1">2.3.1</option>
              <option value="2.2.1">2.2.1</option>
              <option value="2.1.1">2.1.1</option>
              <option value="2.0.1">2.0.1</option>
              <option value="1.1.1">1.1.1</option>
            </Question>

            <Question label="How many environments do you need to migrate?" name="numEnvironments" type="select" value={formData.numEnvironments} onChange={handleChange}>
              <option value="1">1 (Production only)</option>
              <option value="2">2 (Production + Staging)</option>
              <option value="3">3 (Production + Staging + Development)</option>
              <option value="4">4+ (Multiple environments)</option>
            </Question>
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
          <Section 
            title="2. Kafka Core & Data Migration" 
            sectionKey="kafkaCore"
          >
            <Question label="How many active Kafka topics are in use across all MSK clusters?" name="numTopics" type="number" value={formData.numTopics} onChange={handleChange} min="1" />
            <Question label="What is the total number of partitions across all topics?" name="numPartitions" type="number" value={formData.numPartitions} onChange={handleChange} min="1" />
            <Question label="What is your current replication factor?" name="currentReplicationFactor" type="select" value={formData.currentReplicationFactor} onChange={handleChange}>
              <option value="1">1 (No replication)</option>
              <option value="2">2</option>
              <option value="3">3 (Recommended)</option>
              <option value="custom">Custom</option>
            </Question>
            <Question label="What is your current retention period?" name="currentRetentionPeriod" type="select" value={formData.currentRetentionPeriod} onChange={handleChange}>
              <option value="1_day">1 Day</option>
              <option value="7_days">7 Days</option>
              <option value="30_days">30 Days</option>
              <option value="90_days">90 Days</option>
              <option value="custom">Custom</option>
            </Question>
            <Question label="What message format do you currently use?" name="messageFormat" type="select" value={formData.messageFormat} onChange={handleChange}>
              <option value="json">JSON</option>
              <option value="avro">Avro</option>
              <option value="protobuf">Protobuf</option>
              <option value="string">String</option>
              <option value="binary">Binary</option>
              <option value="mixed">Mixed formats</option>
            </Question>
            <Question label="Do you use message compression?" name="messageCompression" type="select" value={formData.messageCompression} onChange={handleChange}>
              <option value="none">No compression</option>
              <option value="gzip">Gzip</option>
              <option value="snappy">Snappy</option>
              <option value="lz4">LZ4</option>
              <option value="zstd">ZSTD</option>
              <option value="mixed">Mixed compression</option>
            </Question>
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
          <Section 
            title="3. Applications & Connectivity" 
            sectionKey="applications"
          >
            <Question label="How many applications are currently connected to MSK?" name="numApplications" type="number" value={formData.numApplications} onChange={handleChange} min="1" />
            <Question label="What Kafka client versions are currently in use?" name="kafkaClientVersions" type="select" value={formData.kafkaClientVersions} onChange={handleChange}>
              <option value="0.10.x">0.10.x</option>
              <option value="0.11.x">0.11.x</option>
              <option value="1.0.x">1.0.x</option>
              <option value="2.0.x">2.0.x</option>
              <option value="2.5.x">2.5.x</option>
              <option value="2.8.x">2.8.x</option>
              <option value="3.0.x">3.0.x</option>
              <option value="mixed">Mixed versions</option>
            </Question>
            <Question label="What client libraries are being used?" name="clientLibraries" type="select" value={formData.clientLibraries} onChange={handleChange}>
              <option value="java">Java</option>
              <option value="python">Python</option>
              <option value="nodejs">Node.js</option>
              <option value="golang">Go</option>
              <option value="dotnet">.NET</option>
              <option value="mixed">Mixed languages</option>
            </Question>
            <Question label="Are there any custom client configurations in use?" name="hasCustomClientConfigs" type="select" value={formData.hasCustomClientConfigs} onChange={handleChange}>
              <option value="no">No (Mostly defaults)</option>
              <option value="yes">Yes (Custom configs)</option>
            </Question>
            <Question label="Do you use any custom serializers/deserializers?" name="hasCustomSerializers" type="select" value={formData.hasCustomSerializers} onChange={handleChange}>
              <option value="no">No (Standard serializers)</option>
              <option value="yes">Yes (Custom serializers)</option>
            </Question>
            <Question label="Are there any applications using custom partitioning logic?" name="hasCustomPartitioning" type="select" value={formData.hasCustomPartitioning} onChange={handleChange}>
              <option value="no">No (Default partitioning)</option>
              <option value="yes">Yes (Custom partitioning)</option>
            </Question>
            <Question label="Do you have any applications using exactly-once semantics?" name="hasExactlyOnceSemantics" type="select" value={formData.hasExactlyOnceSemantics} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="Are there any applications using transactions?" name="hasTransactions" type="select" value={formData.hasTransactions} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="Do you have any applications using custom interceptors?" name="hasCustomInterceptors" type="select" value={formData.hasCustomInterceptors} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="Are there any applications using custom error handling?" name="hasCustomErrorHandling" type="select" value={formData.hasCustomErrorHandling} onChange={handleChange}>
              <option value="no">No (Standard error handling)</option>
              <option value="yes">Yes (Custom error handling)</option>
            </Question>
            <Question label="Do you have any applications using custom retry logic?" name="hasCustomRetryLogic" type="select" value={formData.hasCustomRetryLogic} onChange={handleChange}>
              <option value="no">No (Standard retry)</option>
              <option value="yes">Yes (Custom retry)</option>
            </Question>
          </Section>

          {/* Ecosystem & Operational Tools */}
          <Section 
            title="4. Ecosystem & Operational Tools" 
            sectionKey="ecosystem"
          >
            <Question label="What monitoring tools are currently in use?" name="monitoringTools" type="select" value={formData.monitoringTools} onChange={handleChange}>
              <option value="cloudwatch">AWS CloudWatch</option>
              <option value="prometheus">Prometheus</option>
              <option value="grafana">Grafana</option>
              <option value="datadog">Datadog</option>
              <option value="newrelic">New Relic</option>
              <option value="custom">Custom solution</option>
              <option value="none">No monitoring</option>
            </Question>
            <Question label="What metrics are you currently monitoring?" name="monitoredMetrics" type="select" value={formData.monitoredMetrics} onChange={handleChange}>
              <option value="basic">Basic (CPU, Memory, Disk)</option>
              <option value="standard">Standard (Basic + Kafka metrics)</option>
              <option value="advanced">Advanced (Standard + Custom metrics)</option>
            </Question>
            <Question label="What alerting system is in place?" name="alertingSystem" type="select" value={formData.alertingSystem} onChange={handleChange}>
              <option value="cloudwatch">AWS CloudWatch Alarms</option>
              <option value="pagerduty">PagerDuty</option>
              <option value="opsgenie">OpsGenie</option>
              <option value="custom">Custom solution</option>
              <option value="none">No alerting</option>
            </Question>
            <Question label="What logging solution is being used?" name="loggingSolution" type="select" value={formData.loggingSolution} onChange={handleChange}>
              <option value="cloudwatch">AWS CloudWatch Logs</option>
              <option value="elasticsearch">Elasticsearch</option>
              <option value="splunk">Splunk</option>
              <option value="datadog">Datadog</option>
              <option value="custom">Custom solution</option>
            </Question>
            <Question label="What automation tools are in use?" name="automationTools" type="select" value={formData.automationTools} onChange={handleChange}>
              <option value="terraform">Terraform</option>
              <option value="cloudformation">CloudFormation</option>
              <option value="ansible">Ansible</option>
              <option value="custom">Custom scripts</option>
              <option value="none">No automation</option>
            </Question>
            <Question label="Do you use any custom operational tools?" name="hasCustomOperationalTools" type="select" value={formData.hasCustomOperationalTools} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="What backup solution is currently in use?" name="backupSolution" type="select" value={formData.backupSolution} onChange={handleChange}>
              <option value="s3">AWS S3</option>
              <option value="custom">Custom solution</option>
              <option value="none">No backup solution</option>
            </Question>
            <Question label="Do you have any custom dashboards or reporting tools?" name="hasCustomDashboards" type="select" value={formData.hasCustomDashboards} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
          </Section>

          {/* Security & Governance */}
          <Section 
            title="5. Security & Governance" 
            sectionKey="security"
          >
            <Question label="What encryption method is used for data at rest?" name="encryptionAtRest" type="select" value={formData.encryptionAtRest} onChange={handleChange}>
              <option value="kms">AWS KMS</option>
              <option value="custom">Custom encryption</option>
              <option value="none">No encryption</option>
            </Question>
            <Question label="What encryption method is used for data in transit?" name="encryptionInTransit" type="select" value={formData.encryptionInTransit} onChange={handleChange}>
              <option value="tls">TLS/SSL</option>
              <option value="custom">Custom encryption</option>
              <option value="none">No encryption</option>
            </Question>
            <Question label="What authentication method is used for clients?" name="clientAuthentication" type="select" value={formData.clientAuthentication} onChange={handleChange}>
              <option value="iam">IAM</option>
              <option value="sasl_scram">SASL/SCRAM</option>
              <option value="mtls">mTLS</option>
              <option value="plain">SASL/PLAIN</option>
              <option value="none">No authentication</option>
            </Question>
            <Question label="What authorization method is used?" name="authorizationMethod" type="select" value={formData.authorizationMethod} onChange={handleChange}>
              <option value="acl">ACLs</option>
              <option value="rbac">RBAC</option>
              <option value="custom">Custom authorization</option>
              <option value="none">No authorization</option>
            </Question>
            <Question label="How are credentials managed?" name="credentialManagement" type="select" value={formData.credentialManagement} onChange={handleChange}>
              <option value="secrets_manager">AWS Secrets Manager</option>
              <option value="vault">HashiCorp Vault</option>
              <option value="custom">Custom solution</option>
              <option value="none">No credential management</option>
            </Question>
            <Question label="Do you have any compliance requirements?" name="hasComplianceRequirements" type="select" value={formData.hasComplianceRequirements} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="What audit logging is in place?" name="auditLogging" type="select" value={formData.auditLogging} onChange={handleChange}>
              <option value="cloudtrail">AWS CloudTrail</option>
              <option value="custom">Custom solution</option>
              <option value="none">No audit logging</option>
            </Question>
            <Question label="Do you have any custom security policies?" name="hasCustomSecurityPolicies" type="select" value={formData.hasCustomSecurityPolicies} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
          </Section>

          {/* Network & Connectivity */}
          <Section 
            title="6. Network & Connectivity" 
            sectionKey="network"
          >
            <Question label="What is your current network topology?" name="networkTopology" type="select" value={formData.networkTopology} onChange={handleChange}>
              <option value="single_vpc">Single VPC</option>
              <option value="multi_vpc">Multiple VPCs</option>
              <option value="hybrid">Hybrid (On-prem + Cloud)</option>
            </Question>
            <Question label="What security groups are in use?" name="securityGroups" type="select" value={formData.securityGroups} onChange={handleChange}>
              <option value="default">Default security groups</option>
              <option value="custom">Custom security groups</option>
              <option value="none">No security groups</option>
            </Question>
            <Question label="What is your current bandwidth usage?" name="bandwidthUsage" type="select" value={formData.bandwidthUsage} onChange={handleChange}>
              <option value="low">Low (&lt; 10 Mbps)</option>
              <option value="medium">Medium (10-100 Mbps)</option>
              <option value="high">High (&gt; 100 Mbps)</option>
            </Question>
            <Question label="Do you use VPC peering?" name="usesVpcPeering" type="select" value={formData.usesVpcPeering} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="Do you use AWS PrivateLink?" name="usesPrivateLink" type="select" value={formData.usesPrivateLink} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="Do you have any custom network configurations?" name="hasCustomNetworkConfigs" type="select" value={formData.hasCustomNetworkConfigs} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="What is your current latency requirement?" name="latencyRequirement" type="select" value={formData.latencyRequirement} onChange={handleChange}>
              <option value="high">High (&gt; 100ms)</option>
              <option value="medium">Medium (50-100ms)</option>
              <option value="low">Low (&lt; 50ms)</option>
            </Question>
            <Question label="Do you have any specific network security requirements?" name="hasNetworkSecurityRequirements" type="select" value={formData.hasNetworkSecurityRequirements} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
          </Section>

          {/* Performance & Scaling */}
          <Section 
            title="7. Performance & Scaling" 
            sectionKey="performance"
          >
            <Question label="What is your current throughput requirement?" name="throughputRequirement" type="select" value={formData.throughputRequirement} onChange={handleChange}>
              <option value="low">Low (&lt; 1 MB/s)</option>
              <option value="medium">Medium (1-10 MB/s)</option>
              <option value="high">High (&gt; 10 MB/s)</option>
            </Question>
            <Question label="What is your current latency requirement?" name="performanceLatencyRequirement" type="select" value={formData.performanceLatencyRequirement} onChange={handleChange}>
              <option value="high">High (&gt; 100ms)</option>
              <option value="medium">Medium (50-100ms)</option>
              <option value="low">Low (&lt; 50ms)</option>
            </Question>
            <Question label="What is your current partition count?" name="partitionCount" type="select" value={formData.partitionCount} onChange={handleChange}>
              <option value="low">Low (&lt; 100)</option>
              <option value="medium">Medium (100-1000)</option>
              <option value="high">High (&gt; 1000)</option>
            </Question>
            <Question label="What is your current broker count?" name="brokerCount" type="select" value={formData.brokerCount} onChange={handleChange}>
              <option value="low">Low (1-3)</option>
              <option value="medium">Medium (4-9)</option>
              <option value="high">High (&gt; 9)</option>
            </Question>
            <Question label="Do you require auto-scaling?" name="requiresAutoScaling" type="select" value={formData.requiresAutoScaling} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="What is your current message size?" name="messageSize" type="select" value={formData.messageSize} onChange={handleChange}>
              <option value="small">Small (&lt; 1KB)</option>
              <option value="medium">Medium (1KB-10KB)</option>
              <option value="large">Large (&gt; 10KB)</option>
            </Question>
            <Question label="What is your current retention period?" name="retentionPeriod" type="select" value={formData.retentionPeriod} onChange={handleChange}>
              <option value="short">Short (&lt; 1 day)</option>
              <option value="medium">Medium (1-7 days)</option>
              <option value="long">Long (&gt; 7 days)</option>
            </Question>
            <Question label="Do you have any specific performance requirements?" name="hasSpecificPerformanceRequirements" type="select" value={formData.hasSpecificPerformanceRequirements} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
          </Section>

          {/* Disaster Recovery & High Availability */}
          <Section 
            title="8. Disaster Recovery & High Availability" 
            sectionKey="disasterRecovery"
          >
            <Question label="What is your current backup strategy?" name="backupStrategy" type="select" value={formData.backupStrategy} onChange={handleChange}>
              <option value="none">No backup</option>
              <option value="manual">Manual backup</option>
              <option value="automated">Automated backup</option>
              <option value="continuous">Continuous backup</option>
            </Question>
            <Question label="What is your Recovery Time Objective (RTO)?" name="rto" type="select" value={formData.rto} onChange={handleChange}>
              <option value="hours">Hours</option>
              <option value="minutes">Minutes</option>
              <option value="seconds">Seconds</option>
            </Question>
            <Question label="What is your Recovery Point Objective (RPO)?" name="rpo" type="select" value={formData.rpo} onChange={handleChange}>
              <option value="hours">Hours</option>
              <option value="minutes">Minutes</option>
              <option value="seconds">Seconds</option>
            </Question>
            <Question label="Do you require multi-region deployment?" name="requiresMultiRegion" type="select" value={formData.requiresMultiRegion} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="What is your current high availability setup?" name="highAvailabilitySetup" type="select" value={formData.highAvailabilitySetup} onChange={handleChange}>
              <option value="none">No HA</option>
              <option value="basic">Basic (2-3 brokers)</option>
              <option value="advanced">Advanced (4+ brokers)</option>
            </Question>
            <Question label="Do you have a disaster recovery plan?" name="hasDisasterRecoveryPlan" type="select" value={formData.hasDisasterRecoveryPlan} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="Do you require automated failover?" name="requiresAutomatedFailover" type="select" value={formData.requiresAutomatedFailover} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="Do you have any specific disaster recovery requirements?" name="hasSpecificDRRequirements" type="select" value={formData.hasSpecificDRRequirements} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
          </Section>

          {/* Cost Analysis & Optimization */}
          <Section 
            title="9. Cost Analysis & Optimization" 
            sectionKey="costAnalysis"
          >
            <Question label="What is your current storage usage?" name="storageUsage" type="select" value={formData.storageUsage} onChange={handleChange}>
              <option value="low">Low (&lt; 100 GB)</option>
              <option value="medium">Medium (100 GB - 1 TB)</option>
              <option value="high">High (&gt; 1 TB)</option>
            </Question>
            <Question label="What is your current network usage?" name="networkUsage" type="select" value={formData.networkUsage} onChange={handleChange}>
              <option value="low">Low (&lt; 1 TB/month)</option>
              <option value="medium">Medium (1-10 TB/month)</option>
              <option value="high">High (&gt; 10 TB/month)</option>
            </Question>
            <Question label="What is your current compute usage?" name="computeUsage" type="select" value={formData.computeUsage} onChange={handleChange}>
              <option value="low">Low (&lt; 10 vCPUs)</option>
              <option value="medium">Medium (10-50 vCPUs)</option>
              <option value="high">High (&gt; 50 vCPUs)</option>
            </Question>
            <Question label="What is your current monthly cost?" name="currentMonthlyCost" type="select" value={formData.currentMonthlyCost} onChange={handleChange}>
              <option value="low">Low (&lt; $1,000)</option>
              <option value="medium">Medium ($1,000-$5,000)</option>
              <option value="high">High (&gt; $5,000)</option>
            </Question>
            <Question label="What is your target monthly cost?" name="targetMonthlyCost" type="select" value={formData.targetMonthlyCost} onChange={handleChange}>
              <option value="lower">Lower than current</option>
              <option value="same">Same as current</option>
              <option value="higher">Higher than current</option>
            </Question>
            <Question label="Do you have any specific cost optimization requirements?" name="hasCostOptimizationRequirements" type="select" value={formData.hasCostOptimizationRequirements} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="Do you require cost allocation by team/department?" name="requiresCostAllocation" type="select" value={formData.requiresCostAllocation} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="Do you have any specific budget constraints?" name="hasBudgetConstraints" type="select" value={formData.hasBudgetConstraints} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
          </Section>

          {/* Target State */}
          <Section 
            title="10. Target State" 
            sectionKey="targetState"
          >
            <Question label="What is your target cluster size?" name="targetClusterSize" type="select" value={formData.targetClusterSize} onChange={handleChange}>
              <option value="small">Small (1-3 brokers)</option>
              <option value="medium">Medium (4-9 brokers)</option>
              <option value="large">Large (&gt; 9 brokers)</option>
            </Question>
            <Question label="What is your target region?" name="targetRegion" type="select" value={formData.targetRegion} onChange={handleChange}>
              <option value="us_east_1">US East (N. Virginia)</option>
              <option value="us_west_2">US West (Oregon)</option>
              <option value="eu_west_1">EU (Ireland)</option>
              <option value="ap_southeast_1">Asia Pacific (Singapore)</option>
              <option value="custom">Custom</option>
            </Question>
            <Question label="What is your target environment?" name="targetEnvironment" type="select" value={formData.targetEnvironment} onChange={handleChange}>
              <option value="dev">Development</option>
              <option value="staging">Staging</option>
              <option value="prod">Production</option>
              <option value="multi">Multiple environments</option>
            </Question>

            <Question label="What is your target timeline?" name="targetTimeline" type="select" value={formData.targetTimeline} onChange={handleChange}>
              <option value="immediate">Immediate</option>
              <option value="1_month">1 Month</option>
              <option value="3_months">3 Months</option>
              <option value="6_months">6 Months</option>
              <option value="custom">Custom</option>
            </Question>
            <Question label="What is your target budget?" name="targetBudget" type="select" value={formData.targetBudget} onChange={handleChange}>
              <option value="lower">Lower than current</option>
              <option value="same">Same as current</option>
              <option value="higher">Higher than current</option>
            </Question>
            <Question label="Do you have any specific target state requirements?" name="hasTargetStateRequirements" type="select" value={formData.hasTargetStateRequirements} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
            <Question label="Do you require any specific features in the target state?" name="hasSpecificFeatureRequirements" type="select" value={formData.hasSpecificFeatureRequirements} onChange={handleChange}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Question>
          </Section>

          {/* Migration Goals */}
          <Section title="11. Migration Goals" sectionKey="goals">
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
            <h2 className="text-2xl font-bold text-[#0A3D62]">Migration Effort Estimate</h2>
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
              <p className="text-xl font-semibold text-[#0A3D62]">Overall Estimated Effort:</p>
              <span className={`text-3xl font-extrabold px-4 py-2 rounded-lg ${
                effortLevel === 'Low Effort' ? 'bg-green-200 text-green-800' :
                effortLevel === 'Medium Effort' ? 'bg-yellow-200 text-yellow-800' :
                effortLevel === 'High Effort' ? 'bg-orange-200 text-orange-800' :
                'bg-red-200 text-red-800'
              }`}>
                {effortLevel}
              </span>
            </div>
            <p className="text-lg text-[#0A3D62] mb-4">Total Complexity Score: <span className="font-bold">{totalScore}</span></p>

            <h3 className="text-xl font-semibold text-[#0A3D62] mb-3">Selected Configuration:</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* General & Scope */}
              <div className="bg-white p-4 rounded-lg shadow">
                <h4 className="font-bold text-[#0A3D62] mb-2">1. General & Scope</h4>
                <ul className="space-y-1 text-sm">
                  <li><span className="font-medium">Number of MSK Clusters:</span> {formData.numMskClusters}</li>
                  <li><span className="font-medium">Current MSK Version:</span> {formData.currentMskVersion}</li>
                  <li><span className="font-medium">Target Confluent Cloud Version:</span> {formData.targetConfluentVersion}</li>
                  <li><span className="font-medium">Number of Environments:</span> {formData.numEnvironments}</li>
                  <li><span className="font-medium">Desired Timeline:</span> {formData.desiredTimeline.replace(/_/g, ' ')}</li>
                  <li><span className="font-medium">Strict NFRs:</span> {formData.hasStrictNFRs === 'yes' ? 'Yes' : 'No'}</li>
                  <li><span className="font-medium">Team Kafka Experience:</span> {formData.teamKafkaExperience.charAt(0).toUpperCase() + formData.teamKafkaExperience.slice(1)}</li>
                  <li><span className="font-medium">Dedicated Migration Team:</span> {formData.dedicatedMigrationTeam === 'yes' ? 'Yes' : 'No'}</li>
                </ul>
              </div>

              {/* Kafka Core */}
              <div className="bg-white p-4 rounded-lg shadow">
                <h4 className="font-bold text-[#0A3D62] mb-2">2. Kafka Core & Data Migration</h4>
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
                <h4 className="font-bold text-[#0A3D62] mb-2">3. Applications & Connectivity</h4>
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
                <h4 className="font-bold text-[#0A3D62] mb-2">4. Ecosystem & Tools</h4>
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
                <h4 className="font-bold text-[#0A3D62] mb-2">5. Security & Governance</h4>
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
                <h4 className="font-bold text-[#0A3D62] mb-2">6. Network & Connectivity</h4>
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
                <h4 className="font-bold text-[#0A3D62] mb-2">7. Performance & Scaling</h4>
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
                <h4 className="font-bold text-[#0A3D62] mb-2">8. Disaster Recovery & HA</h4>
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
                <h4 className="font-bold text-[#0A3D62] mb-2">9. Cost Analysis</h4>
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
                <h4 className="font-bold text-[#0A3D62] mb-2">10. Target State</h4>
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
                <h4 className="font-bold text-[#0A3D62] mb-2">11. Migration Goals</h4>
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

            <h3 className="text-xl font-semibold text-[#0A3D62] mb-3">Complexity Breakdown by Category:</h3>
            <div className="bg-white p-4 rounded-lg shadow">
              <ul className="space-y-2">
                {Object.entries(categoryScores).map(([category, score]) => (
                  <li key={category} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                    <span className="capitalize text-[#0A3D62]">{category.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span className="font-bold text-lg text-[#0A3D62]">{score}</span>
                  </li>
                ))}
              </ul>
            </div>

            <h3 className="text-xl font-semibold text-[#0A3D62] mt-6 mb-3">Key Recommendations:</h3>
            <div className="space-y-4 text-[#0A3D62]">
              {getRecommendations.filter(rec => rec.trim() !== '').map((rec, index) => (
                <div key={index} dangerouslySetInnerHTML={{ __html: rec }} className="pl-4" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper Components for better readability
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
