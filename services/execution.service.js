// services/execution.service.js
import { ServerlessFunction, ExecutionLog } from "../models/ServerlessFunction.js";
import { v4 as uuidv4 } from 'uuid';
import openwhisk from "openwhisk";
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

import dotenv from "dotenv";
dotenv.config();

const ow = openwhisk({
  apihost: process.env.WHISK_APIHOST || "http://172.17.0.1:3233",
  api_key: process.env.WHISK_AUTH || "23bc46b1-71f6-4ed5-8c54-816aa4f8c502:123zO3xZCLrMN6v2BKK1dXYFpXlPkccOFqm12CdAsMgRU4VrNZ9lyGVCGuMDGIwP",
  namespace: process.env.OPENWHISK_NAMESPACE || 'guest'
});

// Configuration
const OPENWHISK_NAMESPACE = process.env.OPENWHISK_NAMESPACE || 'guest';
const OPENWHISK_PACKAGE_NAME = process.env.OPENWHISK_PACKAGE || 'default';
const OPENWHISK_DEPENDENCY_DIRECTORY = process.env.OPENWHISK_DEPENDENCY_DIRECTORY || '/tmp/openwhisk-dependencies';
const OPENWHISK_FUNCTION_PATH = process.env.OPENWHISK_FUNCTION_PATH || '/tmp';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Wrap user code for different runtimes
const wrapUserCode = (userCode, runtime) => {
  const runtimeLower = runtime.toLowerCase();
  
  if (runtimeLower.includes('nodejs') || runtimeLower.includes('node')) {
    // Node.js wrapper
    return `function main(params) {
  try {
    // User's function
    const userFunction = ${userCode};
    
    // Call user function with params
    const result = userFunction(params);
    
    return {
      statusCode: 200,
      body: result
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: {
        error: error.message,
        stack: error.stack
      }
    };
  }
}

exports.main = main;
`;
  } else if (runtimeLower.includes('python')) {
    // Python wrapper
    return `def main(args):
    try:
        # User's function code
${userCode.split('\n').map(line => '        ' + line).join('\n')}
        
        # Call the user's function if it exists
        if 'main' in dir():
            result = main(args)
        else:
            result = args
        
        return {
            'statusCode': 200,
            'body': result
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'body': {
                'error': str(e)
            }
        }
`;
  } else if (runtimeLower.includes('go')) {
    // Go - user provides complete main package
    return userCode;
  } else if (runtimeLower.includes('swift')) {
    // Swift wrapper
    return `import Foundation

func main(args: [String:Any]) -> [String:Any] {
    do {
        // User's function code
${userCode.split('\n').map(line => '        ' + line).join('\n')}
        
        // Return the result
        return [
            "statusCode": 200,
            "body": args
        ]
    } catch {
        return [
            "statusCode": 500,
            "body": [
                "error": "\\(error)"
            ]
        ]
    }
}
`;
  } else if (runtimeLower.includes('php')) {
    // PHP wrapper
    return `<?php
function main(array $args): array {
    try {
        // User's function code
${userCode.split('\n').map(line => '        ' + line).join('\n')}
        
        return [
            'statusCode' => 200,
            'body' => $args
        ];
    } catch (Exception $e) {
        return [
            'statusCode' => 500,
            'body' => [
                'error' => $e->getMessage()
            ]
        ];
    }
}
?>
`;
  }
  
  // Default: return as-is
  return userCode;
};

// Get file extension and main file based on runtime
const getRuntimeConfig = (runtime) => {
  const runtimeLower = runtime.toLowerCase();
  
  if (runtimeLower.includes('nodejs') || runtimeLower.includes('node')) {
    return {
      extension: '.js',
      mainFile: 'index.js',
      packageFile: 'package.json',
      packageContent: { main: 'index.js' },
      dependencyFolder: 'node_modules',
      setupPackage: null,
      needsWrapper: true
    };
  } else if (runtimeLower.includes('python')) {
    return {
      extension: '.py',
      mainFile: '__main__.py',
      packageFile: 'requirements.txt',
      packageContent: '',
      dependencyFolder: 'virtualenv',
      setupPackage: null,
      needsWrapper: true
    };
  } else if (runtimeLower.includes('go')) {
    return {
      extension: '.go',
      mainFile: 'main.go',
      packageFile: 'go.mod',
      packageContent: 'module action\n\ngo 1.21\n',
      dependencyFolder: null,
      setupPackage: null,
      needsWrapper: false
    };
  } else if (runtimeLower.includes('swift')) {
    return {
      extension: '.swift',
      mainFile: 'main.swift',
      packageFile: 'Package.swift',
      packageContent: null,
      dependencyFolder: null,
      setupPackage: (tempDir) => {
        // Create proper Swift package structure
        const sourcesDir = path.join(tempDir, 'Sources');
        const actionDir = path.join(sourcesDir, 'Action');
        fs.mkdirSync(actionDir, { recursive: true });
        
        // Move main.swift to Sources/Action/main.swift
        const mainSwiftPath = path.join(tempDir, 'main.swift');
        const targetPath = path.join(actionDir, 'main.swift');
        if (fs.existsSync(mainSwiftPath)) {
          fs.renameSync(mainSwiftPath, targetPath);
        }
        
        // Create Package.swift with proper structure
        const packageSwift = `// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "Action",
    platforms: [
        .macOS(.v12)
    ],
    products: [
        .executable(
            name: "Action",
            targets: ["Action"]
        )
    ],
    targets: [
        .executableTarget(
            name: "Action",
            path: "Sources/Action"
        )
    ]
)
`;
        fs.writeFileSync(path.join(tempDir, 'Package.swift'), packageSwift);
      },
      needsWrapper: true
    };
  } else if (runtimeLower.includes('php')) {
    return {
      extension: '.php',
      mainFile: 'index.php',
      packageFile: 'composer.json',
      packageContent: JSON.stringify({ require: {} }, null, 2),
      dependencyFolder: 'vendor',
      setupPackage: null,
      needsWrapper: true
    };
  } else {
    // Default to Node.js
    return {
      extension: '.js',
      mainFile: 'index.js',
      packageFile: 'package.json',
      packageContent: { main: 'index.js' },
      dependencyFolder: 'node_modules',
      setupPackage: null,
      needsWrapper: true
    };
  }
};

// Helper function to create zip file with function code
const createFunctionZip = async (functionCode, actionName, runtime) => {
  const tempDir = path.join(OPENWHISK_FUNCTION_PATH, actionName);
  
  try {
    // Create temp directory
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Get runtime configuration
    const config = getRuntimeConfig(runtime);
    
    // Wrap user code if needed
    const finalCode = config.needsWrapper 
      ? wrapUserCode(functionCode, runtime)
      : functionCode;
    
    console.log(`📝 Code wrapping: ${config.needsWrapper ? 'Applied' : 'Not needed'}`);
    
    // Copy dependencies if they exist and runtime needs them
    if (config.dependencyFolder) {
      const dependencySource = path.join(OPENWHISK_DEPENDENCY_DIRECTORY, config.dependencyFolder);
      if (fs.existsSync(dependencySource)) {
        fs.cpSync(
          dependencySource,
          path.join(tempDir, config.dependencyFolder),
          { recursive: true }
        );
        console.log(`✅ Copied ${config.dependencyFolder} to temp directory`);
      }
    }
    
    // Write the function code
    fs.writeFileSync(path.join(tempDir, config.mainFile), finalCode);
    console.log(`✅ Written ${config.mainFile}`);
    
    // Create package/config file if needed
    if (config.packageFile && config.packageContent !== null) {
      const packageContent = typeof config.packageContent === 'string' 
        ? config.packageContent 
        : JSON.stringify(config.packageContent, null, 2);
      
      fs.writeFileSync(path.join(tempDir, config.packageFile), packageContent);
      console.log(`✅ Created ${config.packageFile}`);
    }
    
    // Run custom setup if needed (for Swift, etc.)
    if (config.setupPackage) {
      console.log('🔧 Running custom package setup...');
      config.setupPackage(tempDir);
      console.log('✅ Custom package setup completed');
    }
    
    // Create zip file
    execSync(`zip -r ${actionName}.zip .`, {
      cwd: tempDir,
      stdio: 'inherit'
    });
    
    // Read the zip file
    const zipFile = fs.readFileSync(path.join(tempDir, `${actionName}.zip`));
    console.log(`✅ Zip file created: ${actionName}.zip`);
    
    return { zipFile, tempDir };
  } catch (error) {
    // Cleanup on error
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    throw error;
  }
};

// Execute function by UUID - WITH MULTI-LANGUAGE ZIP DEPLOYMENT
export const executeFunction = async (uuid, input = {}, userId = null, keepAction = true) => {
  const startTime = Date.now();
  const executionId = uuidv4();
  let tempDir = null;
  let actionName = null;
  
  try {
    // Get the function
    const func = await ServerlessFunction.findOne({ uuid });
    console.log("Function data:", func);
    
    if (!func) {
      throw new Error('Function not found');
    }
    
    // Check if user has permission to execute
    if (userId && func.createdBy.toString() !== userId && !func.isPublic) {
      throw new Error('Access denied to execute this function');
    }
    
    if (!func.isActive) {
      throw new Error('Function is not active');
    }
    
    const namespace = OPENWHISK_NAMESPACE;
    const packageName = OPENWHISK_PACKAGE_NAME;
    actionName = `func-${uuid.replace(/-/g, '')}-${Date.now()}`;
    
    console.log(`📦 Creating zip package for action: ${actionName}`);
    console.log(`🔧 Runtime: ${func.runtime}`);
    
    // Create zip file with function code
    const { zipFile, tempDir: createdTempDir } = await createFunctionZip(
      func.code,
      actionName,
      func.runtime
    );
    tempDir = createdTempDir;
    
    console.log('✅ Zip package created successfully');
    
    // Check if action already exists
    let actionExists = false;
    try {
      await ow.actions.get({ name: actionName });
      actionExists = true;
    } catch (err) {
      if (err.statusCode !== 404) {
        throw err;
      }
    }
    
    // Create or update the action with zip file
    const actionParams = {
      name: actionName,
      action: zipFile,
      kind: func.runtime,
      web: true,
      annotations: {
        'web-export': true,
        'raw-http': false,
        'final': true
      }
    };
    
    console.log(`${actionExists ? '🔄 Updating' : '🆕 Creating'} action...`);
    
    if (actionExists) {
      await ow.actions.update(actionParams);
      console.log('✅ Action updated with zip package');
    } else {
      await ow.actions.create(actionParams);
      console.log('✅ Action created with zip package');
    }
    
    // Generate web URL
    const apihost = process.env.WHISK_APIHOST || "http://172.17.0.1:3233";
    const cleanApiHost = apihost.replace(/(^\w+:|^)\/\//, '');
    const webActionUrl = `http://${cleanApiHost}/api/v1/web/${namespace}/${packageName}/${actionName}.json`;
    const webActionUrlPlain = `http://${cleanApiHost}/api/v1/web/${namespace}/${packageName}/${actionName}`;
    
    console.log(`🌐 Web Action URL: ${webActionUrl}`);
    
    // Invoke the action directly (for immediate execution)
    console.log('🚀 Invoking action...');
    const invokeResult = await ow.actions.invoke({
      name: actionName,
      params: input,
      blocking: true,
      result: true
    });
    
    const executionTime = Date.now() - startTime;
    console.log(`⏱️ Execution completed in ${executionTime}ms`);
    
    // Parse the response
    let result = invokeResult;
    let status = 'success';
    let errorDetails = null;
    
    // Check for error in response
    if (invokeResult && invokeResult.error) {
      status = 'error';
      errorDetails = {
        message: invokeResult.error,
        type: 'RuntimeError'
      };
      result = { error: invokeResult.error };
    } else if (invokeResult && invokeResult.body && invokeResult.statusCode === 500) {
      status = 'error';
      errorDetails = {
        message: invokeResult.body.error || 'Runtime error',
        type: 'RuntimeError'
      };
      result = invokeResult.body;
    }
    
    // Update function statistics
    func.executionCount += 1;
    func.lastExecutedAt = new Date();
    func.averageExecutionTime = Math.round(
      (func.averageExecutionTime * (func.executionCount - 1) + executionTime) / func.executionCount
    );
    
    const totalExecutions = func.executionCount;
    const currentSuccessRate = func.successRate;
    const successRate = status === 'success'
      ? Math.round(((currentSuccessRate * (totalExecutions - 1)) + 100) / totalExecutions)
      : Math.round((currentSuccessRate * (totalExecutions - 1)) / totalExecutions);
    
    func.successRate = Math.min(100, Math.max(0, successRate));
    await func.save();
    
    // Save execution log
    const executionLog = await ExecutionLog.create({
      functionId: func._id,
      functionUuid: func.uuid,
      executionId,
      input,
      output: result,
      status,
      executionTime,
      invokedBy: userId,
      errorDetails,
      metadata: {
        actionName,
        namespace,
        package: packageName,
        runtime: func.runtime,
        webActionUrl: webActionUrlPlain,
        webActionUrlJson: webActionUrl,
        keepAction,
        deploymentMethod: 'zip'
      }
    });
    
    // Schedule cleanup (30 minutes for keepAction, 5 minutes otherwise)
    const cleanupDelay = keepAction ? 1800000 : 300000;
    setTimeout(async () => {
      try {
        console.log(`🗑️ Cleaning up action: ${actionName}`);
        await ow.actions.delete({ name: actionName });
        console.log(`✅ Action deleted: ${actionName}`);
      } catch (deleteError) {
        console.warn(`Failed to delete action ${actionName}:`, deleteError.message);
      }
    }, cleanupDelay);
    
    return {
      success: true,
      executionId,
      functionUuid: func.uuid,
      functionName: func.name,
      status,
      executionTime: `${executionTime}ms`,
      result: result,
      webActionUrl: webActionUrlPlain,
      webActionUrlJson: webActionUrl,
      actionName: actionName,
      logId: executionLog._id,
      keepAction: keepAction,
      runtime: func.runtime,
      accessInstructions: {
        getTest: `${webActionUrlPlain}?test=true`,
        postTest: `curl -X POST ${webActionUrl} -H "Content-Type: application/json" -d '${JSON.stringify(input)}'`,
        expiresIn: keepAction ? '30 minutes' : '5 minutes'
      }
    };
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error('❌ Execution error:', error);
    
    // Try to get detailed error from activation logs
    let errorDetail = error.message || 'Unknown error during action invocation.';
    let activationId = error?.error?.activationId;
    
    if (actionName) {
      try {
        if (!activationId) {
          const recent = await ow.activations.list({
            name: actionName,
            limit: 1,
            skip: 0,
            docs: true
          });
          activationId = recent?.[0]?.activationId;
        }
        
        if (activationId) {
          await sleep(2000);
          const activation = await ow.activations.get({ activationId });
          console.log('Activation info:', activation);
          errorDetail = activation?.response?.result?.error || 
                       JSON.stringify(activation?.response?.result || {}, null, 2);
        }
      } catch (activationError) {
        console.error('Failed to retrieve activation info:', activationError);
      }
    }
    
    // Save error log if we have the function
    try {
      const func = await ServerlessFunction.findOne({ uuid });
      if (func) {
        await ExecutionLog.create({
          functionId: func._id,
          functionUuid: func.uuid,
          executionId,
          input,
          output: { error: errorDetail },
          status: 'error',
          executionTime,
          invokedBy: userId,
          errorDetails: {
            message: errorDetail,
            type: error.name || 'ExecutionError',
            stack: error.stack
          },
          metadata: {
            error: errorDetail,
            stack: error.stack,
            deploymentMethod: 'zip',
            runtime: func.runtime,
            actionName: actionName
          }
        });
        
        // Update function statistics for error
        func.executionCount += 1;
        func.lastExecutedAt = new Date();
        const totalExecutions = func.executionCount;
        const currentSuccessRate = func.successRate;
        const successRate = Math.round((currentSuccessRate * (totalExecutions - 1)) / totalExecutions);
        func.successRate = Math.max(0, successRate);
        await func.save();
      }
    } catch (logError) {
      console.error('Failed to save error log:', logError);
    }
    
    throw error;
  } finally {
    // Cleanup temp directory
    if (tempDir) {
      try {
        console.log('🧹 Cleaning up temp directory:', tempDir);
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log('✅ Temp directory cleaned up');
      } catch (cleanError) {
        console.warn('Temp directory cleanup warning:', cleanError);
      }
    }
  }
};

// Get execution logs for a function
export const getFunctionLogs = async (uuid, options = {}, userId = null) => {
  const {
    page = 1,
    limit = 20,
    status,
    startDate,
    endDate,
    sortBy = '-createdAt'
  } = options;
  
  const func = await ServerlessFunction.findOne({ uuid });
  
  if (!func) {
    throw new Error('Function not found');
  }
  
  if (userId && func.createdBy.toString() !== userId && !func.isPublic) {
    throw new Error('Access denied to view logs for this function');
  }
  
  const query = { functionUuid: uuid };
  
  if (status) query.status = status;
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }
  
  const skip = (page - 1) * limit;
  
  const [logs, total] = await Promise.all([
    ExecutionLog.find(query)
      .populate('invokedBy', 'username email')
      .sort(sortBy)
      .skip(skip)
      .limit(limit)
      .lean(),
    ExecutionLog.countDocuments(query)
  ]);
  
  return {
    logs,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    },
    function: {
      name: func.name,
      uuid: func.uuid,
      executionCount: func.executionCount,
      averageExecutionTime: func.averageExecutionTime,
      successRate: func.successRate
    }
  };
};

// Direct code execution with ZIP deployment - supports multiple languages
export const runCodeOnWhisk = async (code, input = {}, userId = null, tempUuid = null, runtime = 'nodejs:20') => {
  const startTime = Date.now();
  const executionId = uuidv4();
  const uuid = tempUuid || uuidv4();
  let actionName = `temp-exec-${Date.now()}`;
  let tempDir = null;
  
  try {
    const namespace = OPENWHISK_NAMESPACE;
    const packageName = OPENWHISK_PACKAGE_NAME;
    
    // Basic validation
    if (!code || code.trim().length === 0) {
      throw new Error('Code cannot be empty');
    }
    
    console.log(`📦 Creating zip package for temporary execution: ${actionName}`);
    console.log(`🔧 Runtime: ${runtime}`);
    
    // Create zip file with function code
    const { zipFile, tempDir: createdTempDir } = await createFunctionZip(
      code,
      actionName,
      runtime
    );
    tempDir = createdTempDir;
    
    console.log('✅ Zip package created successfully');
    
    // Generate web action URL
    const apihost = process.env.WHISK_APIHOST || "http://172.17.0.1:3233";
    const cleanApiHost = apihost.replace(/(^\w+:|^)\/\//, '');
    const webActionUrl = `http://${cleanApiHost}/api/v1/web/${namespace}/${packageName}/${actionName}.json`;
    const webActionUrlPlain = `http://${cleanApiHost}/api/v1/web/${namespace}/${packageName}/${actionName}`;
    
    // Create the action with zip file
    const actionParams = {
      name: actionName,
      action: zipFile,
      kind: runtime,
      web: true,
      annotations: {
        'web-export': true,
        'raw-http': false,
        'final': true
      }
    };
    
    console.log('🆕 Creating action...');
    await ow.actions.create(actionParams);
    console.log('✅ Action created with zip package');
    
    // Invoke the action
    console.log('🚀 Invoking action...');
    const invokeResult = await ow.actions.invoke({
      name: actionName,
      params: input,
      blocking: true,
      result: true
    });
    
    const executionTime = Date.now() - startTime;
    console.log(`⏱️ Execution completed in ${executionTime}ms`);
    
    // Parse response
    let result = invokeResult;
    let status = 'success';
    
    if (invokeResult && invokeResult.error) {
      result = { error: invokeResult.error };
      status = 'error';
    } else if (invokeResult && invokeResult.body && invokeResult.statusCode === 500) {
      result = invokeResult.body;
      status = 'error';
    }
    
    // Save execution log
    await ExecutionLog.create({
      functionId: null,
      functionUuid: uuid,
      executionId,
      input,
      output: result,
      status,
      executionTime,
      invokedBy: userId,
      metadata: {
        actionName,
        namespace,
        package: packageName,
        runtime: runtime,
        directExecution: true,
        webActionUrl: webActionUrlPlain,
        webActionUrlJson: webActionUrl,
        deploymentMethod: 'zip'
      }
    });
    
    // Schedule cleanup after 5 minutes
    setTimeout(async () => {
      try {
        await ow.actions.delete({ name: actionName });
        console.log(`✅ Temporary action deleted: ${actionName}`);
      } catch (deleteError) {
        console.warn(`Failed to delete direct action ${actionName}:`, deleteError.message);
      }
    }, 300000);
    
    return {
      success: true,
      executionId,
      uuid,
      status,
      executionTime: `${executionTime}ms`,
      result,
      webActionUrl: webActionUrlPlain,
      webActionUrlJson: webActionUrl,
      actionName: actionName,
      logId: executionId,
      runtime: runtime,
      accessInstructions: {
        test: `${webActionUrlPlain}?test=true`,
        expiresIn: '5 minutes'
      }
    };
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    // Try to get detailed error from activation logs
    let errorDetail = error.message || 'Unknown error during action invocation.';
    let activationId = error?.error?.activationId;
    
    if (actionName) {
      try {
        if (!activationId) {
          const recent = await ow.activations.list({
            name: actionName,
            limit: 1,
            skip: 0,
            docs: true
          });
          activationId = recent?.[0]?.activationId;
        }
        
        if (activationId) {
          await sleep(2000);
          const activation = await ow.activations.get({ activationId });
          console.log('Activation info:', activation);
          errorDetail = activation?.response?.result?.error || 
                       JSON.stringify(activation?.response?.result || {}, null, 2);
        }
      } catch (activationError) {
        console.error('Failed to retrieve activation info:', activationError);
      }
    }
    
    // Save error log
    try {
      await ExecutionLog.create({
        functionId: null,
        functionUuid: uuid,
        executionId,
        input,
        output: { error: errorDetail },
        status: 'error',
        executionTime,
        invokedBy: userId,
        errorDetails: {
          message: errorDetail,
          type: error.name || 'ExecutionError',
          stack: error.stack
        },
        metadata: {
          error: errorDetail,
          directExecution: true,
          deploymentMethod: 'zip',
          runtime: runtime,
          actionName: actionName
        }
      });
    } catch (logError) {
      console.error('Failed to save error log:', logError);
    }
    
    throw error;
  } finally {
    // Cleanup temp directory
    if (tempDir) {
      try {
        console.log('🧹 Cleaning up temp directory:', tempDir);
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanError) {
        console.warn('Temp directory cleanup warning:', cleanError);
      }
    }
  }
};

// Test web action URL
export const testWebAction = async (actionName, params = {}) => {
  try {
    const apihost = process.env.WHISK_APIHOST || "http://172.17.0.1:3233";
    const namespace = OPENWHISK_NAMESPACE;
    const packageName = OPENWHISK_PACKAGE_NAME;
    
    const testUrl = `${apihost}/api/v1/web/${namespace}/${packageName}/${actionName}.json`;
    const testUrlPlain = `${apihost}/api/v1/web/${namespace}/${packageName}/${actionName}`;
    
    console.log(`🔍 Testing web action: ${actionName}`);
    console.log(`🔗 JSON URL: ${testUrl}`);
    console.log(`🔗 Plain URL: ${testUrlPlain}`);
    
    // Try both URLs
    let response, data;
    try {
      response = await fetch(testUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      data = await response.json();
    } catch (jsonError) {
      // If JSON fails, try plain
      response = await fetch(testUrlPlain, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      data = await response.text();
    }
    
    return {
      success: response.ok,
      status: response.status,
      url: testUrlPlain,
      urlJson: testUrl,
      data: data,
      testedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      testedAt: new Date().toISOString()
    };
  }
};