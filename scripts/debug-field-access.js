/**
 * Debug field access resolution 
 */
const ResolutionServiceFactory = require('../dist/services/resolution/ResolutionService/ResolutionService.js');
const StateServiceFactory = require('../dist/services/state/StateService/StateService.js');

// Create a test object
const testObject = {
  name: "John Doe",
  age: 30,
  occupation: "Developer",
  address: {
    street: "123 Main St",
    city: "Anytown",
    state: "CA",
    zip: "12345"
  }
};

// Setup test environment
async function main() {
  try {
    // Create our services
    const stateService = new StateServiceFactory.StateService();
    const resolutionService = new ResolutionServiceFactory.ResolutionService({ stateService });
    
    // Add a data variable
    stateService.setDataVar('person', testObject);
    
    // Create a context
    const context = {
      state: stateService,
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      }
    };
    
    // Get our variable resolver from the resolution service
    const variableReferenceResolver = resolutionService.getVariableResolver();
    
    // Test direct field access on the object
    console.log('DIRECT FIELD ACCESS TEST:');
    variableReferenceResolver.debugFieldAccess(
      testObject,
      ['name'],
      context
    );
    
    // Test nested field access
    console.log('\nNESTED FIELD ACCESS TEST:');
    variableReferenceResolver.debugFieldAccess(
      testObject,
      ['address', 'city'],
      context
    );
    
    // Try to resolve using the service directly
    console.log('\nTEST VARIABLE RESOLUTION:');
    const resolvedSimple = await variableReferenceResolver.resolve('{{person.name}}', context);
    console.log('Resolved person.name:', resolvedSimple);
    
    const resolvedNested = await variableReferenceResolver.resolve('{{person.address.city}}', context);
    console.log('Resolved person.address.city:', resolvedNested);
    
    // Test data object retrieval
    const personObj = stateService.getDataVar('person');
    console.log('\nRaw person object from state:', personObj);
    
    // See what happens in actual text resolution
    console.log('\nSimple resolution test:');
    const text1 = 'Testing {{person.name}}';
    const text2 = 'Testing {{person.address.city}}';
    
    const resolved1 = await variableReferenceResolver.resolve(text1, context);
    const resolved2 = await variableReferenceResolver.resolve(text2, context);
    
    console.log('Resolved text 1:', resolved1);
    console.log('Resolved text 2:', resolved2);
  } catch (error) {
    console.error('ERROR:', error);
  }
}

main().catch(console.error); 