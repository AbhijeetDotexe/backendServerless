// services/execution.service.js
import { ServerlessFunction, ExecutionLog } from "../models/ServerlessFunction.js";
import { v4 as uuidv4 } from 'uuid';
import openwhisk from "openwhisk";

const ow = openwhisk({
  apihost: process.env.WHISK_APIHOST || "http://172.17.0.1:3233",
  api_key: process.env.WHISK_AUTH ||
    "23bc46b1-71f6-4ed5-8c54-816aa4f8c502:123zO3xZCLrMN6v2BKK1dXYFpXlPkccOFqm12CdAsMgRU4VrNZ9lyGVCGuMDGIwP",
  namespace: process.env.OPENWHISK_NAMESPACE || 'guest'
});

// Execute function by UUID - FIXED WEB URL ISSUE
export const executeFunction = async (uuid, input = {}, userId = null, keepAction = true) => {
  const startTime = Date.now();
  const executionId = uuidv4();

  try {
    // Get the function
    const func = await ServerlessFunction.findOne({ uuid });
    

    console.log("This is the function data in which the runtime is wrong: ", func);
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

    const namespace = process.env.OPENWHISK_NAMESPACE || 'guest';
    const packageName = process.env.OPENWHISK_PACKAGE || 'default';
    const actionName = `func-${uuid.replace(/-/g, '')}-${Date.now()}`;

    // 🔥 FIX: Use the EXACT format from your original working code
    const actionParams = {
      name: actionName,
      action: `
        function main(params) {
          try {
            // Execute the user's function code
            const userFunction = ${func.code};
            
            // Call the user's function
            const result = userFunction(params);
            
            return { 
              headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
              },
              statusCode: 200,
              body: JSON.stringify({ 
                success: true, 
                result: result,
                executionId: '${executionId}'
              })
            };
          } catch (err) {
            return {
              headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
              },
              statusCode: 200,
              body: JSON.stringify({ 
                success: false, 
                error: err.message,
                executionId: '${executionId}'
              })
            };
          }
        }
      `,
      kind: func.runtime,
      // kind: "nodejs:20",
      web: true, // This is the key parameter
      annotations: {
        'web-export': true,
        'raw-http': false,
        'final': true
      }
    };

    console.log(`📝 Creating action: ${actionName}`);
    
    // Create the action
    await ow.actions.create(actionParams);
    console.log('✅ Action created with web export enabled');

    // 🔥 FIX: Generate web URL using the EXACT format from original code
    const apihost = process.env.WHISK_APIHOST || "http://172.17.0.1:3233";
    const cleanApiHost = apihost.replace(/(^\w+:|^)\/\//, '');
    const webActionUrl = `http://${cleanApiHost}/api/v1/web/${namespace}/${packageName}/${actionName}.json`;
    const webActionUrlPlain = `http://${cleanApiHost}/api/v1/web/${namespace}/${packageName}/${actionName}`;

    console.log(`🌐 Web Action URL: ${webActionUrl}`);
    console.log(`🔗 Plain URL: ${webActionUrlPlain}`);

    // Test the web URL immediately
    let webTestResult = null;
    try {
      console.log('🔍 Testing web URL immediately...');
      const testResponse = await fetch(webActionUrlPlain, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(input)
      });
      
      if (testResponse.ok) {
        webTestResult = await testResponse.json();
        console.log('✅ Web URL test successful');
      } else {
        console.warn(`⚠️ Web URL test failed: ${testResponse.status}`);
      }
    } catch (webError) {
      console.warn('⚠️ Web URL test error:', webError.message);
    }

    // Invoke the action directly (for immediate execution)
    const response = await ow.actions.invoke({
      actionName,
      blocking: true,
      result: true,
      params: input
    });

    const executionTime = Date.now() - startTime;

    // Parse the response
    let result = response;
    let status = 'success';
    let errorDetails = null;

    // Check for error in response
    if (response && response.error) {
      status = 'error';
      errorDetails = {
        message: response.error,
        type: 'RuntimeError'
      };
      result = { error: response.error };
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
        webTestResult: webTestResult,
        immediateTestUrl: `${webActionUrlPlain}?name=TestUser`
      }
    });

    // Schedule cleanup (5 minutes for non-persistent, 30 minutes for keepAction)
    const cleanupDelay = keepAction ? 1800000 : 300000;
    
    setTimeout(async () => {
      try {
        console.log(`🗑️ Cleaning up action: ${actionName}`);
        await ow.actions.delete(actionName);
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
      accessInstructions: {
        immediateGetTest: `${webActionUrlPlain}?name=Abhijeet`,
        postTest: `curl -X POST ${webActionUrl} -H "Content-Type: application/json" -d '${JSON.stringify(input)}'`,
        expiresIn: keepAction ? '30 minutes' : '5 minutes'
      },
      webTest: webTestResult ? 'URL tested and working' : 'URL needs testing'
    };

  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    console.error('❌ Execution error:', error);
    
    // Save error log if we have the function
    try {
      const func = await ServerlessFunction.findOne({ uuid });
      if (func) {
        await ExecutionLog.create({
          functionId: func._id,
          functionUuid: func.uuid,
          executionId,
          input,
          output: { error: error.message },
          status: 'error',
          executionTime,
          invokedBy: userId,
          errorDetails: {
            message: error.message,
            type: error.name || 'ExecutionError'
          },
          metadata: {
            error: error.message,
            stack: error.stack
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

// Direct code execution
export const runCodeOnWhisk = async (code, input = {}, userId = null, tempUuid = null) => {
  const startTime = Date.now();
  const executionId = uuidv4();
  const uuid = tempUuid || uuidv4();
  const actionName = `temp-exec-${Date.now()}`;

  try {
    const namespace = process.env.OPENWHISK_NAMESPACE || 'guest';
    const packageName = process.env.OPENWHISK_PACKAGE || 'default';

    // Basic validation
    if (!code || code.trim().length === 0) {
      throw new Error('Code cannot be empty');
    }

    // Generate web action URL
    const apihost = process.env.WHISK_APIHOST || "http://172.17.0.1:3233";
    const cleanApiHost = apihost.replace(/(^\w+:|^)\/\//, '');
    const webActionUrl = `http://${cleanApiHost}/api/v1/web/${namespace}/${packageName}/${actionName}.json`;

    // Create the action with proper web export
    const actionParams = {
      name: actionName,
      action: `
        function main(params) {
          try {
            const result = (function() { 
              ${code} 
            })();
            
            return { 
              headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
              },
              statusCode: 200,
              body: JSON.stringify({ 
                success: true, 
                result: result,
                executionId: '${executionId}'
              })
            };
          } catch (err) {
            return {
              headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
              },
              statusCode: 200,
              body: JSON.stringify({ 
                success: false, 
                error: err.message,
                executionId: '${executionId}'
              })
            };
          }
        }
      `,
      kind: 'nodejs:20',
      web: true,
      annotations: {
        'web-export': true,
        'raw-http': false,
        'final': true
      }
    };

    await ow.actions.create(actionParams);

    // Invoke the action
    const response = await ow.actions.invoke({
      actionName,
      blocking: true,
      result: true,
      params: input
    });

    const executionTime = Date.now() - startTime;

    // Parse response
    let result = response;
    let status = 'success';

    if (response && response.error) {
      result = { error: response.error };
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
        runtime: 'nodejs:20',
        directExecution: true,
        webActionUrl: webActionUrl.replace('.json', ''),
        webActionUrlJson: webActionUrl
      }
    });

    // Schedule cleanup after 5 minutes
    setTimeout(async () => {
      try {
        await ow.actions.delete(actionName);
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
      webActionUrl: webActionUrl.replace('.json', ''),
      webActionUrlJson: webActionUrl,
      actionName: actionName,
      logId: executionId,
      accessInstructions: {
        immediateTest: `Test now: ${webActionUrl.replace('.json', '')}?name=TestUser`,
        expiresIn: '5 minutes'
      }
    };

  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    // Save error log
    try {
      await ExecutionLog.create({
        functionId: null,
        functionUuid: uuid,
        executionId,
        input,
        output: { error: error.message },
        status: 'error',
        executionTime,
        invokedBy: userId,
        errorDetails: {
          message: error.message,
          type: error.name || 'ExecutionError'
        },
        metadata: {
          error: error.message,
          directExecution: true
        }
      });
    } catch (logError) {
      console.error('Failed to save error log:', logError);
    }

    throw error;
  }
};

// Test web action URL
export const testWebAction = async (actionName, params = {}) => {
  try {
    const apihost = process.env.WHISK_APIHOST || "http://172.17.0.1:3233";
    const namespace = process.env.OPENWHISK_NAMESPACE || 'guest';
    const packageName = process.env.OPENWHISK_PACKAGE || 'default';
    
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
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
      });
      data = await response.json();
    } catch (jsonError) {
      // If JSON fails, try plain
      response = await fetch(testUrlPlain, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
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