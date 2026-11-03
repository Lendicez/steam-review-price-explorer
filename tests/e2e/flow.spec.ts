import {test,expect} from '@playwright/test';
test('validates input and loads complete language registry with independent source states',async({page})=>{
 await page.goto('/');await page.getByLabel('查詢 Steam 遊戲').fill('https://evil.example/app/620');await page.getByRole('button',{name:'開始分析'}).click();await expect(page.getByRole('alert')).toContainText('只接受');
 await page.getByLabel('查詢 Steam 遊戲').fill('620');await page.getByRole('button',{name:'開始分析'}).click();await expect(page.locator('tbody tr[data-language]')).toHaveCount(31);await expect(page.getByRole('heading',{name:/Portal 2/})).toBeVisible();await expect(page.locator('.stats')).toContainText('載入完成',{timeout:90000});
 await page.getByLabel('搜尋語言',{exact:true}).fill('繁體');await expect(page.locator('tbody tr[data-language]')).toHaveCount(1);const before=await page.locator('tr[data-language="tchinese"] td').nth(1).innerText();await page.getByLabel('繁體中文代表商店').selectOption('HK');await expect(page.getByLabel('繁體中文代表商店')).toHaveValue('HK');expect(await page.locator('tr[data-language="tchinese"] td').nth(1).innerText()).toBe(before);
 await page.getByRole('button',{name:'未折扣原價',exact:true}).click();await expect(page).toHaveURL(/basis=initial/);
});
