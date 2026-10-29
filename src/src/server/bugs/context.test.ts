import { createBugContext } from './context';
it('uses bounded server UA and valid server build identity', () => {
  const context = createBugContext({ pathname: '/bugs', query: 'status=new&q=private', viewportWidth: 800, viewportHeight: 600 }, 'a'.repeat(3000), 'a'.repeat(40));
  expect(context).toMatchObject({ pagePath: '/bugs', pageQuery: 'status=new', userAgent: 'a'.repeat(2048), appBuildSha: 'a'.repeat(40), viewportWidth: 800, viewportHeight: 600 });
  expect(createBugContext({ pathname: '/today', query: '', viewportWidth: 800, viewportHeight: 600 }, '', 'invalid').appBuildSha).toBeNull();
});
