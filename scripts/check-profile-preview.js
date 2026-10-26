async(page)=>{
 await page.goto('http://127.0.0.1:4192/?mode=expense-design&tab=expenses');const f=page.frameLocator('#phone');await f.getByRole('button',{name:'我的',exact:true}).click();await f.getByText('旅行与同行人管理',{exact:true}).waitFor();await f.getByRole('button',{name:'编辑资料',exact:true}).click();await f.getByText('编辑我的资料',{exact:true}).waitFor();
 await page.goto('http://127.0.0.1:4192/?mode=expense-design&tab=expenses');await f.getByRole('button',{name:'我的',exact:true}).click();await f.getByRole('button',{name:'返回上一页',exact:true}).click();await f.getByText('旅行账本',{exact:true}).waitFor();
 await page.goto('http://127.0.0.1:4192/app?mode=guest&tab=expenses');await page.getByRole('button',{name:'我的',exact:true}).click();await page.getByText('登录后继续',{exact:false}).first().waitFor({timeout:3000}).catch(async()=>{if(!(await page.locator('body').innerText()).includes('登录'))throw Error('Missing login guard')});
 await page.goto('http://127.0.0.1:4192/?mode=expense-design&tab=expenses');await f.getByRole('button',{name:'我的',exact:true}).click();await f.getByText('旅行与同行人管理',{exact:true}).waitFor();return 'PASS: profile open, edit profile, return to expenses, guest login guard';
}
