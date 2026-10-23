"""Read-only check of local staff team choices and embedded pond browsing."""
import requests
from playwright.sync_api import sync_playwright
API='http://127.0.0.1:8080';SITE='http://127.0.0.1:5500'

def main():
    accounts=[('officer@judges.invalid','JudgeOfficer123!','panchayat',True),
              ('worker@judges.invalid','JudgeWorker123!','worker',True)]
    import os
    if os.environ.get('STAFF_PORTAL_CHECK_PASSWORD'):
        accounts += [('anugrahks2007@gmail.com',os.environ['STAFF_PORTAL_CHECK_PASSWORD'],'panchayat',False),
                     ('anugrahks2008@gmail.com',os.environ['STAFF_PORTAL_CHECK_PASSWORD'],'worker',False)]
    with sync_playwright() as p:
        browser=p.chromium.launch()
        for email,password,folder,demo in accounts:
            login=requests.post(API+'/api/auth/login',json={'email':email,'password':password},timeout=10)
            login.raise_for_status();session=login.json();assert session['demo'] is demo
            headers={'Authorization':'Bearer '+session['token']}
            context=browser.new_context(viewport={'width':1366,'height':768},reduced_motion='reduce');page=context.new_page();errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(SITE+'/login.html');page.evaluate('(s)=>Auth.save(s)',session);page.goto(SITE+'/'+folder+'/dashboard.html')
            page.get_by_role('link',name='Public pond status',exact=True).click()
            assert '/'+folder+'/' in page.url and 'index.html' not in page.url
            page.wait_for_function("document.querySelector('#pondCount').textContent !== '-'")
            expected=requests.get(API+'/api/public/ponds',headers=headers,timeout=10).json()
            assert int(page.locator('#pondCount').inner_text())==len(expected)
            assert page.locator('.sidebar').is_visible()
            if expected:
                page.get_by_role('button',name='View details').first.click()
                page.locator('#pondStatusBody').get_by_role('heading',name='Complaint timeline').wait_for()
                assert '/'+folder+'/' in page.url
                assert page.locator('#pondStatusBody a[href^="report.html"]').count()==0
                page.locator('#pondStatusDialog').get_by_role('button',name='Close',exact=True).click()
            for width in [390,768,1366]:
                page.set_viewport_size({'width':width,'height':900})
                page.wait_for_timeout(150)
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            if folder=='panchayat':
                workers=requests.get(API+'/api/users?role=FIELD_WORKER',headers=headers,timeout=10).json()
                assert {x['team'] for x in workers}>={'Team '+str(n) for n in range(1,6)}
                problems=requests.get(API+'/api/problems',headers=headers,timeout=10).json()
                candidate=next((x for x in problems if x['status'] in ('SUBMITTED','REOPENED')),None)
                if candidate:
                    page.goto(SITE+'/panchayat/complaints.html?open='+str(candidate['id']))
                    page.locator('#assignWorker option').nth(5).wait_for(state='attached')
                    options=page.locator('#assignWorker option').all_text_contents()[1:]
                    assert len(options)>=5
                    for i in range(5):assert options[i].startswith('Team '+str(i+1)+' - ') and '(Lead)' in options[i],options
                    assert options[0].startswith('Team 1 - Anaswar (Lead)'),options
            assert not errors,errors
            print('PASS:',folder,('demo' if demo else 'real'),'pond list/detail stay inside portal; numbered teams verified where applicable',flush=True)
            context.close()
        browser.close()
if __name__=='__main__':main()
