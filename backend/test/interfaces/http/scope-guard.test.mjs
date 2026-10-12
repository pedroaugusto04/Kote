import test from 'node:test';
import assert from 'node:assert/strict';

import { ScopeGuard, extractScopeSlugs } from '../../../dist/interfaces/http/guards/scope.guard.js';
import { SCOPE_HEADERS, RESOLUTION_ERROR_MESSAGES } from '../../../dist/interfaces/http/guards/resolution-guards.constants.js';

function createMockReflector(options = {}) {
  return {
    getAllAndOverride() {
      return options;
    },
  };
}

function createMockResolver(scopeResult) {
  return {
    async resolve(userId, input) {
      if (typeof scopeResult === 'function') {
        return scopeResult(userId, input);
      }
      return scopeResult;
    },
  };
}

function createMockContext(request) {
  return {
    switchToHttp() {
      return {
        getRequest() {
          return request;
        },
      };
    },
    getHandler() {
      return () => {};
    },
    getClass() {
      return class {};
    },
  };
}

test('extractScopeSlugs extracts from headers, params, query, or body safely', () => {
  const reqWithHeaders = {
    headers: {
      [SCOPE_HEADERS.WORKSPACE_SLUG]: 'corp-ws',
      [SCOPE_HEADERS.PROJECT_SLUG]: 'corp-proj',
    },
  };
  assert.deepEqual(extractScopeSlugs(reqWithHeaders), {
    workspaceSlug: 'corp-ws',
    projectSlug: 'corp-proj',
  });

  const reqWithUndefinedBody = {
    headers: {},
    params: { workspaceSlug: 'p-ws' },
    query: {},
  };
  assert.deepEqual(extractScopeSlugs(reqWithUndefinedBody), {
    workspaceSlug: 'p-ws',
    projectSlug: undefined,
  });
});

test('ScopeGuard resolves workspace and populates request.scope, request.workspaceId', async () => {
  const reflector = createMockReflector({ project: 'none' });
  const mockScope = {
    userId: 'user-1',
    workspaceId: 'ws-999',
    workspaceSlug: 'team-ws',
    projectId: null,
    projectSlug: null,
  };
  const resolver = createMockResolver(mockScope);
  const guard = new ScopeGuard(reflector, resolver);

  const request = {
    user: { id: 'user-1' },
    headers: { [SCOPE_HEADERS.WORKSPACE_SLUG]: 'team-ws' },
  };

  const allowed = await guard.canActivate(createMockContext(request));
  assert.equal(allowed, true);
  assert.deepEqual(request.scope, mockScope);
  assert.equal(request.workspaceId, 'ws-999');
});

test('ScopeGuard throws 404 when project is required but projectSlug is missing', async () => {
  const reflector = createMockReflector({ project: 'required' });
  const resolver = createMockResolver({});
  const guard = new ScopeGuard(reflector, resolver);

  const request = {
    user: { id: 'user-1' },
    headers: { [SCOPE_HEADERS.WORKSPACE_SLUG]: 'team-ws' },
  };

  await assert.rejects(
    async () => guard.canActivate(createMockContext(request)),
    (err) => {
      assert.equal(err.message, RESOLUTION_ERROR_MESSAGES.PROJECT_SLUG_MISSING);
      return true;
    },
  );
});

test('ScopeGuard allows optional project requests when neither project nor workspace is present', async () => {
  const reflector = createMockReflector({ project: 'optional' });
  const resolver = createMockResolver({});
  const guard = new ScopeGuard(reflector, resolver);

  const request = {
    user: { id: 'user-1' },
    headers: {},
    params: {},
    query: {},
  };

  const allowed = await guard.canActivate(createMockContext(request));
  assert.equal(allowed, true);
  assert.equal(request.scope, undefined);
});

test('ScopeGuard resolves the "all" project slug only when the route allows all projects', async () => {
  const { WorkspaceScopeResolver } = await import('../../../dist/application/services/content/workspace-scope-resolver.service.js');
  const resolver = new WorkspaceScopeResolver({
    async getWorkspaceBySlug(_userId, slug) {
      return slug === 'workspace1' ? { id: 'ws-1', workspaceSlug: 'workspace1' } : null;
    },
    async getProjectBySlug() {
      return null;
    },
  });
  const buildRequest = () => ({
    user: { id: 'user-1' },
    headers: {},
    params: { projectSlug: 'all' },
    query: { workspaceSlug: 'workspace1' },
  });

  const allowedRequest = buildRequest();
  const allowedGuard = new ScopeGuard(createMockReflector({ project: 'required', allowAllProjects: true }), resolver);
  assert.equal(await allowedGuard.canActivate(createMockContext(allowedRequest)), true);
  assert.equal(allowedRequest.scope.projectId, 'all');
  assert.equal(allowedRequest.workspaceId, 'ws-1');

  const deniedGuard = new ScopeGuard(createMockReflector({ project: 'required' }), resolver);
  await assert.rejects(
    async () => deniedGuard.canActivate(createMockContext(buildRequest())),
    (err) => {
      assert.equal(err.message, RESOLUTION_ERROR_MESSAGES.PROJECT_NOT_FOUND);
      return true;
    },
  );
});

test('ScopeGuard synchronizes workspaceSlug into requestContext when resolved', async () => {
  const { runWithRequestContext, getRequestContext } = await import('../../../dist/observability/request-context.js');
  const reflector = createMockReflector({ project: 'none' });
  const mockScope = {
    userId: 'user-1',
    workspaceId: 'ws-123',
    workspaceSlug: 'my-workspace',
    projectId: null,
    projectSlug: null,
  };
  const resolver = createMockResolver(mockScope);
  const guard = new ScopeGuard(reflector, resolver);

  const request = {
    user: { id: 'user-1' },
    headers: { [SCOPE_HEADERS.WORKSPACE_SLUG]: 'my-workspace' },
  };

  await runWithRequestContext({ requestId: 'req-1', startTime: Date.now(), method: 'GET', path: '/api/notes', ip: '127.0.0.1' }, async () => {
    assert.equal(getRequestContext()?.workspaceSlug, undefined);
    const allowed = await guard.canActivate(createMockContext(request));
    assert.equal(allowed, true);
    assert.equal(getRequestContext()?.workspaceSlug, 'my-workspace');
  });
});

test('AccessTokenAuthGuard synchronizes userId into requestContext when authenticated', async () => {
  const { AccessTokenAuthGuard } = await import('../../../dist/interfaces/http/guards/auth.guards.js');
  const { runWithRequestContext, getRequestContext } = await import('../../../dist/observability/request-context.js');

  const mockAuthService = {
    async authenticateAccessToken(token) {
      if (token === 'valid-token') {
        return { id: 'user-42', email: 'u42@example.com', displayName: 'U42', role: 'user' };
      }
      throw new Error('invalid');
    },
  };

  const guard = new AccessTokenAuthGuard(mockAuthService);
  const request = {
    headers: { authorization: 'Bearer valid-token' },
    cookies: {},
  };

  await runWithRequestContext({ requestId: 'req-2', startTime: Date.now(), method: 'GET', path: '/api/user', ip: '127.0.0.1' }, async () => {
    assert.equal(getRequestContext()?.userId, undefined);
    const allowed = await guard.canActivate(createMockContext(request));
    assert.equal(allowed, true);
    assert.equal(request.user.id, 'user-42');
    assert.equal(getRequestContext()?.userId, 'user-42');
  });
});

test('extractWorkspaceSlug reads header x-workspace-slug correctly', async () => {
  const { getRequestMetadata } = await import('../../../dist/observability/request-metadata.js');
  const metadata = getRequestMetadata({
    method: 'GET',
    path: '/api/test',
    headers: { 'x-workspace-slug': 'header-slug' },
    query: {},
    params: {},
    socket: { remoteAddress: '127.0.0.1' },
  });
  assert.equal(metadata.workspaceSlug, 'header-slug');
});
