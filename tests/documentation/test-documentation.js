const { TestRunner, TestAssertions, MockLogger } = require('../utils/testHelpers');
const fs = require('fs');
const path = require('path');

/**
 * Documentation and Setup Instructions Validation Tests
 * Tests documentation accuracy, completeness, and deployment readiness
 */

// Documentation Validator
class DocumentationValidator {
    constructor() {
        this.projectRoot = process.cwd();
        this.findings = [];
        this.requiredFiles = [
            'README.md',
            'package.json',
            'tsconfig.json',
            'Dockerfile',
            'docker-compose.yml',
            '.env.example',
            '.dockerignore',
            '.gitignore'
        ];
        this.requiredDirectories = [
            'src',
            'tests',
            'src/services',
            'src/ai',
            'src/client',
            'src/config',
            'src/types'
        ];
    }

    async validateFileExists(filePath) {
        const fullPath = path.join(this.projectRoot, filePath);
        try {
            const stats = fs.statSync(fullPath);
            return {
                exists: true,
                isFile: stats.isFile(),
                isDirectory: stats.isDirectory(),
                size: stats.size,
                path: fullPath
            };
        } catch (error) {
            return {
                exists: false,
                error: error.message,
                path: fullPath
            };
        }
    }

    async validateReadmeContent() {
        const readmePath = path.join(this.projectRoot, 'README.md');
        try {
            const content = fs.readFileSync(readmePath, 'utf8');

            const requiredSections = [
                'WhatsApp LLM Personal Assistant',
                'Features',
                'Installation',
                'Configuration',
                'Usage',
                'Docker',
                'Development',
                'Testing'
            ];

            const findings = {
                hasContent: content.length > 0,
                totalLines: content.split('\n').length,
                wordCount: content.split(/\s+/).length,
                sectionsFound: [],
                missingRequiredSections: [],
                hasInstallationInstructions: false,
                hasConfigurationInstructions: false,
                hasDockerInstructions: false,
                hasDevelopmentInstructions: false,
                hasUsageExamples: false
            };

            // Check for required sections
            for (const section of requiredSections) {
                const sectionRegex = new RegExp(`#.*${section}`, 'i');
                if (sectionRegex.test(content)) {
                    findings.sectionsFound.push(section);
                } else {
                    findings.missingRequiredSections.push(section);
                }
            }

            // Check for specific instruction types
            findings.hasInstallationInstructions = /npm install|yarn install|installation/i.test(content);
            findings.hasConfigurationInstructions = /\.env|configuration|config|environment/i.test(content);
            findings.hasDockerInstructions = /docker|dockerfile|docker-compose/i.test(content);
            findings.hasDevelopmentInstructions = /development|dev|local development/i.test(content);
            findings.hasUsageExamples = /usage|example|how to|getting started/i.test(content);

            return findings;
        } catch (error) {
            return {
                hasContent: false,
                error: error.message
            };
        }
    }

    async validatePackageJson() {
        const packagePath = path.join(this.projectRoot, 'package.json');
        try {
            const content = fs.readFileSync(packagePath, 'utf8');
            const packageJson = JSON.parse(content);

            const requiredFields = ['name', 'version', 'description', 'main', 'scripts'];
            const requiredScripts = ['start', 'dev', 'build', 'test'];

            return {
                isValidJson: true,
                hasRequiredFields: requiredFields.every(field => packageJson.hasOwnProperty(field)),
                missingFields: requiredFields.filter(field => !packageJson.hasOwnProperty(field)),
                hasScripts: !!packageJson.scripts,
                hasRequiredScripts: requiredScripts.every(script => packageJson.scripts?.[script]),
                missingScripts: requiredScripts.filter(script => !packageJson.scripts?.[script]),
                hasDependencies: !!packageJson.dependencies,
                hasDevDependencies: !!packageJson.devDependencies,
                dependencyCount: Object.keys(packageJson.dependencies || {}).length,
                devDependencyCount: Object.keys(packageJson.devDependencies || {}).length,
                name: packageJson.name,
                version: packageJson.version,
                description: packageJson.description
            };
        } catch (error) {
            return {
                isValidJson: false,
                error: error.message
            };
        }
    }

    async validateDockerFiles() {
        const dockerfilePath = path.join(this.projectRoot, 'Dockerfile');
        const dockerComposePath = path.join(this.projectRoot, 'docker-compose.yml');
        const dockerIgnorePath = path.join(this.projectRoot, '.dockerignore');

        const results = {
            dockerfile: { exists: false },
            dockerCompose: { exists: false },
            dockerIgnore: { exists: false }
        };

        // Validate Dockerfile
        try {
            const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');
            results.dockerfile = {
                exists: true,
                hasFrom: /FROM\s+[\w/:.-]+/.test(dockerfileContent),
                hasWorkdir: /WORKDIR\s+/.test(dockerfileContent),
                hasCopy: /COPY\s+/.test(dockerfileContent),
                hasRun: /RUN\s+/.test(dockerfileContent),
                hasExpose: /EXPOSE\s+\d+/.test(dockerfileContent),
                hasCmd: /CMD\s+/.test(dockerfileContent),
                isMultiStage: (dockerfileContent.match(/FROM\s+/g) || []).length > 1,
                lines: dockerfileContent.split('\n').length
            };
        } catch (error) {
            results.dockerfile.error = error.message;
        }

        // Validate docker-compose.yml
        try {
            const composeContent = fs.readFileSync(dockerComposePath, 'utf8');
            results.dockerCompose = {
                exists: true,
                hasVersion: /version:\s*['"]?[\d.]+['"]?/.test(composeContent),
                hasServices: /services:/.test(composeContent),
                hasEnvironment: /environment:/.test(composeContent),
                hasPorts: /ports:/.test(composeContent),
                hasVolumes: /volumes:/.test(composeContent),
                lines: composeContent.split('\n').length
            };
        } catch (error) {
            results.dockerCompose.error = error.message;
        }

        // Validate .dockerignore
        try {
            const dockerIgnoreContent = fs.readFileSync(dockerIgnorePath, 'utf8');
            results.dockerIgnore = {
                exists: true,
                hasNodeModules: /node_modules/.test(dockerIgnoreContent),
                hasTestFiles: /test|spec/.test(dockerIgnoreContent),
                hasDocumentation: /README|\.md/.test(dockerIgnoreContent),
                lines: dockerIgnoreContent.split('\n').length
            };
        } catch (error) {
            results.dockerIgnore.error = error.message;
        }

        return results;
    }

    async validateEnvironmentConfig() {
        const envExamplePath = path.join(this.projectRoot, '.env.example');
        const configPath = path.join(this.projectRoot, 'src/config/environment.ts');

        const results = {
            envExample: { exists: false },
            configFile: { exists: false }
        };

        // Validate .env.example
        try {
            const envContent = fs.readFileSync(envExamplePath, 'utf8');
            const envVars = envContent.split('\n')
                .filter(line => line.trim() && !line.startsWith('#'))
                .map(line => line.split('=')[0].trim());

            results.envExample = {
                exists: true,
                variableCount: envVars.length,
                hasCloudflareVars: envVars.some(v => v.includes('CLOUDFLARE')),
                hasDbVars: envVars.some(v => v.includes('DB') || v.includes('DATABASE')),
                hasLogVars: envVars.some(v => v.includes('LOG')),
                hasNodeEnv: envVars.includes('NODE_ENV'),
                variables: envVars
            };
        } catch (error) {
            results.envExample.error = error.message;
        }

        // Validate config file
        try {
            const configContent = fs.readFileSync(configPath, 'utf8');
            results.configFile = {
                exists: true,
                hasProcessEnv: /process\.env/.test(configContent),
                hasValidation: /validate|schema|joi/.test(configContent),
                hasDefaults: /default|fallback/.test(configContent),
                hasExports: /export/.test(configContent),
                lines: configContent.split('\n').length
            };
        } catch (error) {
            results.configFile.error = error.message;
        }

        return results;
    }

    async validateTypeScriptConfig() {
        const tsconfigPath = path.join(this.projectRoot, 'tsconfig.json');
        try {
            const content = fs.readFileSync(tsconfigPath, 'utf8');
            const tsconfig = JSON.parse(content);

            return {
                isValidJson: true,
                hasCompilerOptions: !!tsconfig.compilerOptions,
                hasTarget: !!tsconfig.compilerOptions?.target,
                hasModule: !!tsconfig.compilerOptions?.module,
                hasOutDir: !!tsconfig.compilerOptions?.outDir,
                hasRootDir: !!tsconfig.compilerOptions?.rootDir,
                hasStrict: tsconfig.compilerOptions?.strict === true,
                hasEsModuleInterop: tsconfig.compilerOptions?.esModuleInterop === true,
                hasInclude: Array.isArray(tsconfig.include),
                hasExclude: Array.isArray(tsconfig.exclude),
                target: tsconfig.compilerOptions?.target,
                module: tsconfig.compilerOptions?.module,
                outDir: tsconfig.compilerOptions?.outDir
            };
        } catch (error) {
            return {
                isValidJson: false,
                error: error.message
            };
        }
    }

    async validateProjectStructure() {
        const structure = {
            requiredFiles: {},
            requiredDirectories: {},
            srcStructure: {},
            testStructure: {}
        };

        // Check required files
        for (const file of this.requiredFiles) {
            structure.requiredFiles[file] = await this.validateFileExists(file);
        }

        // Check required directories
        for (const dir of this.requiredDirectories) {
            structure.requiredDirectories[dir] = await this.validateFileExists(dir);
        }

        // Check src structure
        const srcFiles = [
            'src/main.ts',
            'src/services/StorageService.ts',
            'src/services/TimerService.ts',
            'src/services/ConversationManager.ts',
            'src/ai/CloudflareAI.ts',
            'src/ai/ResponseGenerator.ts',
            'src/client/WhatsAppClient.ts',
            'src/client/MessageHandler.ts',
            'src/config/environment.ts',
            'src/types/index.ts'
        ];

        for (const file of srcFiles) {
            structure.srcStructure[file] = await this.validateFileExists(file);
        }

        // Check test structure
        const testDirs = [
            'tests/unit',
            'tests/integration',
            'tests/health',
            'tests/error',
            'tests/performance',
            'tests/documentation'
        ];

        for (const dir of testDirs) {
            structure.testStructure[dir] = await this.validateFileExists(dir);
        }

        return structure;
    }

    async validateInstallationInstructions() {
        const readmeContent = fs.readFileSync(path.join(this.projectRoot, 'README.md'), 'utf8');
        const packageJson = JSON.parse(fs.readFileSync(path.join(this.projectRoot, 'package.json'), 'utf8'));

        const instructions = {
            hasNodeRequirement: /node|nodejs/i.test(readmeContent),
            hasNpmInstall: /npm install/i.test(readmeContent),
            hasYarnInstall: /yarn install/i.test(readmeContent),
            hasEnvironmentSetup: /\.env|environment|config/i.test(readmeContent),
            hasDatabaseSetup: /database|sqlite|db/i.test(readmeContent),
            hasStartInstructions: /npm start|yarn start|npm run|yarn run/i.test(readmeContent),
            hasDevInstructions: /npm run dev|yarn dev|development/i.test(readmeContent),
            hasBuildInstructions: /npm run build|yarn build|build/i.test(readmeContent),
            hasDockerInstructions: /docker build|docker run|docker-compose/i.test(readmeContent),
            scriptValidation: {
                hasStartScript: !!packageJson.scripts?.start,
                hasDevScript: !!packageJson.scripts?.dev,
                hasBuildScript: !!packageJson.scripts?.build,
                hasTestScript: !!packageJson.scripts?.test
            }
        };

        return instructions;
    }

    generateReport() {
        return {
            timestamp: new Date().toISOString(),
            findings: this.findings,
            summary: {
                totalChecks: this.findings.length,
                passedChecks: this.findings.filter(f => f.status === 'pass').length,
                failedChecks: this.findings.filter(f => f.status === 'fail').length,
                warningChecks: this.findings.filter(f => f.status === 'warning').length
            }
        };
    }

    addFinding(category, check, status, message, details = {}) {
        this.findings.push({
            category,
            check,
            status, // 'pass', 'fail', 'warning'
            message,
            details,
            timestamp: new Date().toISOString()
        });
    }
}

/**
 * Documentation Validation Test Suite
 */
async function runDocumentationTests() {
    const runner = new TestRunner('📚 Documentation & Setup Validation Tests');

    // Create assertion helpers
    const assert = {
        ok: (condition, message) => TestAssertions.assertTrue(condition, message),
        equal: (actual, expected, message) => TestAssertions.assertEqual(actual, expected, message),
        greaterThan: (actual, expected, message) => TestAssertions.assertTrue(actual > expected, message || `Expected ${actual} > ${expected}`),
        contains: (container, item, message) => TestAssertions.assertContains(container, item, message)
    };

    let validator;

    runner.beforeEach(async () => {
        validator = new DocumentationValidator();
    });

    // Test 1: Required Files Existence
    runner.test('should have all required project files', async () => {
        const structure = await validator.validateProjectStructure();

        for (const [fileName, fileInfo] of Object.entries(structure.requiredFiles)) {
            assert.ok(fileInfo.exists, `Required file ${fileName} should exist`);
            if (fileInfo.exists) {
                assert.ok(fileInfo.isFile, `${fileName} should be a file`);
                assert.greaterThan(fileInfo.size, 0, `${fileName} should not be empty`);
            }
        }
    });

    // Test 2: Required Directory Structure
    runner.test('should have proper directory structure', async () => {
        const structure = await validator.validateProjectStructure();

        for (const [dirName, dirInfo] of Object.entries(structure.requiredDirectories)) {
            assert.ok(dirInfo.exists, `Required directory ${dirName} should exist`);
            if (dirInfo.exists) {
                assert.ok(dirInfo.isDirectory, `${dirName} should be a directory`);
            }
        }

        // Check core source files
        const coreFiles = ['src/main.ts', 'src/services/StorageService.ts', 'src/ai/CloudflareAI.ts'];
        for (const file of coreFiles) {
            const fileInfo = structure.srcStructure[file];
            assert.ok(fileInfo?.exists, `Core file ${file} should exist`);
        }
    });

    // Test 3: README Content Validation
    runner.test('should have comprehensive README documentation', async () => {
        const readmeValidation = await validator.validateReadmeContent();

        assert.ok(readmeValidation.hasContent, 'README should have content');
        assert.greaterThan(readmeValidation.totalLines, 50, 'README should be comprehensive (>50 lines)');
        assert.greaterThan(readmeValidation.wordCount, 200, 'README should be detailed (>200 words)');

        // Check for required sections
        const requiredSections = ['Features', 'Installation', 'Configuration', 'Usage'];
        for (const section of requiredSections) {
            assert.contains(readmeValidation.sectionsFound, section, `README should contain ${section} section`);
        }

        assert.ok(readmeValidation.hasInstallationInstructions, 'README should have installation instructions');
        assert.ok(readmeValidation.hasConfigurationInstructions, 'README should have configuration instructions');
        assert.ok(readmeValidation.hasDockerInstructions, 'README should have Docker instructions');
        assert.ok(readmeValidation.hasUsageExamples, 'README should have usage examples');
    });

    // Test 4: Package.json Validation
    runner.test('should have properly configured package.json', async () => {
        const packageValidation = await validator.validatePackageJson();

        assert.ok(packageValidation.isValidJson, 'package.json should be valid JSON');
        assert.ok(packageValidation.hasRequiredFields, 'package.json should have all required fields');
        assert.equal(packageValidation.missingFields.length, 0, 'package.json should not have missing required fields');

        assert.ok(packageValidation.hasScripts, 'package.json should have scripts section');
        assert.ok(packageValidation.hasRequiredScripts, 'package.json should have all required scripts');

        const requiredScripts = ['start', 'dev', 'build', 'test'];
        for (const script of requiredScripts) {
            assert.ok(!packageValidation.missingScripts.includes(script), `package.json should have ${script} script`);
        }

        assert.ok(packageValidation.hasDependencies, 'package.json should have dependencies');
        assert.greaterThan(packageValidation.dependencyCount, 2, 'Should have reasonable number of dependencies');
    });

    // Test 5: Docker Configuration Validation
    runner.test('should have proper Docker configuration', async () => {
        const dockerValidation = await validator.validateDockerFiles();

        // Dockerfile validation
        assert.ok(dockerValidation.dockerfile.exists, 'Dockerfile should exist');
        assert.ok(dockerValidation.dockerfile.hasFrom, 'Dockerfile should have FROM instruction');
        assert.ok(dockerValidation.dockerfile.hasWorkdir, 'Dockerfile should have WORKDIR instruction');
        assert.ok(dockerValidation.dockerfile.hasCopy, 'Dockerfile should have COPY instruction');
        assert.ok(dockerValidation.dockerfile.hasRun, 'Dockerfile should have RUN instruction');
        assert.ok(dockerValidation.dockerfile.hasCmd, 'Dockerfile should have CMD instruction');
        assert.ok(dockerValidation.dockerfile.isMultiStage, 'Dockerfile should use multi-stage build');

        // docker-compose.yml validation
        assert.ok(dockerValidation.dockerCompose.exists, 'docker-compose.yml should exist');
        assert.ok(dockerValidation.dockerCompose.hasVersion, 'docker-compose.yml should specify version');
        assert.ok(dockerValidation.dockerCompose.hasServices, 'docker-compose.yml should define services');

        // .dockerignore validation
        assert.ok(dockerValidation.dockerIgnore.exists, '.dockerignore should exist');
        assert.ok(dockerValidation.dockerIgnore.hasNodeModules, '.dockerignore should exclude node_modules');
    });

    // Test 6: Environment Configuration Validation
    runner.test('should have proper environment configuration', async () => {
        const envValidation = await validator.validateEnvironmentConfig();

        // .env.example validation
        assert.ok(envValidation.envExample.exists, '.env.example should exist');
        assert.greaterThan(envValidation.envExample.variableCount, 5, '.env.example should define multiple variables');
        assert.ok(envValidation.envExample.hasNodeEnv, '.env.example should include NODE_ENV');
        assert.ok(envValidation.envExample.hasCloudflareVars, '.env.example should include Cloudflare variables');

        // Config file validation
        assert.ok(envValidation.configFile.exists, 'Environment config file should exist');
        assert.ok(envValidation.configFile.hasProcessEnv, 'Config should use process.env');
        assert.ok(envValidation.configFile.hasExports, 'Config should export configuration');
    });

    // Test 7: TypeScript Configuration Validation
    runner.test('should have proper TypeScript configuration', async () => {
        const tsconfigValidation = await validator.validateTypeScriptConfig();

        assert.ok(tsconfigValidation.isValidJson, 'tsconfig.json should be valid JSON');
        assert.ok(tsconfigValidation.hasCompilerOptions, 'tsconfig.json should have compiler options');
        assert.ok(tsconfigValidation.hasTarget, 'tsconfig.json should specify target');
        assert.ok(tsconfigValidation.hasModule, 'tsconfig.json should specify module');
        assert.ok(tsconfigValidation.hasOutDir, 'tsconfig.json should specify output directory');
        assert.ok(tsconfigValidation.hasStrict, 'tsconfig.json should enable strict mode');
        assert.ok(tsconfigValidation.hasEsModuleInterop, 'tsconfig.json should enable ES module interop');
        assert.ok(tsconfigValidation.hasInclude, 'tsconfig.json should specify include patterns');
    });

    // Test 8: Installation Instructions Validation
    runner.test('should have clear installation instructions', async () => {
        const installValidation = await validator.validateInstallationInstructions();

        assert.ok(installValidation.hasNodeRequirement, 'Should specify Node.js requirement');
        assert.ok(installValidation.hasNpmInstall || installValidation.hasYarnInstall, 'Should have package installation instructions');
        assert.ok(installValidation.hasEnvironmentSetup, 'Should have environment setup instructions');
        assert.ok(installValidation.hasStartInstructions, 'Should have application start instructions');
        assert.ok(installValidation.hasDevInstructions, 'Should have development setup instructions');
        assert.ok(installValidation.hasDockerInstructions, 'Should have Docker setup instructions');

        // Validate script availability
        assert.ok(installValidation.scriptValidation.hasStartScript, 'Should have start script');
        assert.ok(installValidation.scriptValidation.hasDevScript, 'Should have dev script');
        assert.ok(installValidation.scriptValidation.hasBuildScript, 'Should have build script');
        assert.ok(installValidation.scriptValidation.hasTestScript, 'Should have test script');
    });

    // Test 9: Test Documentation Coverage
    runner.test('should have comprehensive test documentation', async () => {
        const structure = await validator.validateProjectStructure();

        const testDirectories = [
            'tests/unit',
            'tests/integration',
            'tests/health',
            'tests/error',
            'tests/performance',
            'tests/documentation'
        ];

        for (const testDir of testDirectories) {
            const dirInfo = structure.testStructure[testDir];
            assert.ok(dirInfo?.exists, `Test directory ${testDir} should exist`);
            assert.ok(dirInfo?.isDirectory, `${testDir} should be a directory`);
        }
    });

    // Test 10: Production Readiness Documentation
    runner.test('should document production deployment requirements', async () => {
        const readmeValidation = await validator.validateReadmeContent();
        const dockerValidation = await validator.validateDockerFiles();
        const envValidation = await validator.validateEnvironmentConfig();

        // Should have Docker setup for production
        assert.ok(dockerValidation.dockerfile.exists, 'Should have Dockerfile for production deployment');
        assert.ok(dockerValidation.dockerCompose.exists, 'Should have docker-compose for orchestration');

        // Should have environment configuration
        assert.ok(envValidation.envExample.exists, 'Should have environment variable template');
        assert.greaterThan(envValidation.envExample.variableCount, 0, 'Should define environment variables');

        // Should document Docker in README
        assert.ok(readmeValidation.hasDockerInstructions, 'README should document Docker deployment');

        // Should have production-ready scripts
        const packageValidation = await validator.validatePackageJson();
        assert.ok(!packageValidation.missingScripts.includes('start'), 'Should have production start script');
        assert.ok(!packageValidation.missingScripts.includes('build'), 'Should have build script for production');
    });

    return runner.run();
}

// Export for use in test runner
module.exports = runDocumentationTests;

// Run tests if this file is executed directly
if (require.main === module) {
    runDocumentationTests()
        .then(report => {
            console.log('\n🎉 Documentation Validation Complete!');
            console.log(`✅ Passed: ${report.passed}`);
            console.log(`❌ Failed: ${report.failed}`);
            console.log(`📊 Total: ${report.passed + report.failed}`);

            if (report.failed > 0) {
                console.log('\n❌ Failed Tests:');
                report.tests.filter(test => !test.passed).forEach(test => {
                    console.log(`  - ${test.name}: ${test.error}`);
                });
            }

            const hasFailures = report.failed > 0;
            process.exit(hasFailures ? 1 : 0);
        })
        .catch(error => {
            console.error('Documentation validation tests failed to run:', error);
            process.exit(1);
        });
}