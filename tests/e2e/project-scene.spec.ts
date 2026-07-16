import { expect, test } from '@playwright/test';

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3100/api';

test.skip(
  process.env.E2E_DATABASE !== 'true',
  '真实项目场景验收需要 PostgreSQL、Redis 和 MinIO',
);

test('创建项目和场景并在编辑器保存', async ({ page, request }) => {
  test.setTimeout(60_000);
  const uniqueName = `E2E 厂区 ${Date.now()}`;
  let projectId = '';

  try {
    await page.goto('/projects');
    await page.getByTestId('create-project').click();
    const projectDialog = page.getByTestId('project-dialog');
    await projectDialog
      .getByRole('textbox', { name: '项目名称' })
      .fill(uniqueName);
    await projectDialog
      .getByRole('textbox', { name: '项目描述' })
      .fill('端到端自动化项目');
    await projectDialog
      .getByRole('button', { name: '创建', exact: true })
      .click();
    await expect(page).toHaveURL(/\/projects\/[\w-]+$/);
    projectId = page.url().split('/').at(-1) ?? '';

    await page.getByTestId('create-scene').click();
    const sceneDialog = page.getByTestId('scene-dialog');
    await sceneDialog.getByRole('textbox', { name: '场景名称' }).fill('主厂房');
    await sceneDialog
      .getByRole('button', { name: '创建', exact: true })
      .click();
    const sceneCard = page.locator('.scene-card').filter({ hasText: '主厂房' });
    await expect(sceneCard).toBeVisible();

    const editorLink = sceneCard.getByRole('link', { name: '进入编辑器' });
    const sceneId =
      (await editorLink.getAttribute('href'))?.split('/').at(-1) ?? '';
    const sceneResponse = await request.get(`${apiBaseUrl}/scenes/${sceneId}`);
    expect(sceneResponse.ok()).toBe(true);
    const scene = (await sceneResponse.json()) as {
      revision: number;
      document: Record<string, unknown>;
    };
    const saveBody = { baseRevision: scene.revision, document: scene.document };
    expect(
      (
        await request.put(`${apiBaseUrl}/scenes/${sceneId}/document`, {
          data: saveBody,
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await request.put(`${apiBaseUrl}/scenes/${sceneId}/document`, {
          data: saveBody,
        })
      ).status(),
    ).toBe(409);

    await editorLink.click();
    await expect(page.getByTestId('editor-canvas')).toHaveAttribute(
      'data-engine-ready',
      'true',
    );
    // WebGL 初始化和文档请求并行，必须等文档加载完成再点击保存按钮。
    await expect(page.getByTestId('status-bar')).toContainText('已保存');
    const saveResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/scenes/${sceneId}/document`) &&
        response.request().method() === 'PUT',
    );
    await page.getByTestId('save-scene').click();
    expect((await saveResponse).ok()).toBe(true);
    await expect(page.getByTestId('status-bar')).toContainText('已保存');
  } finally {
    if (projectId) {
      await request.delete(`${apiBaseUrl}/projects/${projectId}`);
    }
  }
});
