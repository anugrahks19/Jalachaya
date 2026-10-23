"""Live MySQL browser regression. Removes only its own uniquely named fixture."""
import os, secrets, subprocess, time
from pathlib import Path
import requests
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
API='http://127.0.0.1:8080';SITE='http://127.0.0.1:5500'

def check(response):
    response.raise_for_status();return response.json()

def main():
    suffix=secrets.token_hex(8);email='pond-scope-'+suffix+'@local-check.invalid';password=secrets.token_urlsafe(24)
    pond_name='Temporary Browser Pond '+suffix;ward='Temporary Ward '+suffix
    session=check(requests.post(API+'/api/auth/register',json={'name':'Temporary Scope Citizen','email':email,'password':password},timeout=10))
    headers={'Authorization':'Bearer '+session['token']};problem_id=None;pond_id=None;evidence_paths=[]
    officer=check(requests.post(API+'/api/auth/login',json={'email':'officer@example.com','password':os.environ['LOCAL_CHECK_OFFICER_PASSWORD']},timeout=10))
    worker=check(requests.post(API+'/api/auth/login',json={'email':'worker@example.com','password':os.environ['LOCAL_CHECK_WORKER_PASSWORD']},timeout=10))
    demo=check(requests.post(API+'/api/auth/login',json={'email':'officer@judges.invalid','password':'JudgeOfficer123!'},timeout=10))
    oh={'Authorization':'Bearer '+officer['token']};wh={'Authorization':'Bearer '+worker['token']};dh={'Authorization':'Bearer '+demo['token']}
    try:
        assert session['demo'] is False and officer['demo'] is False and worker['demo'] is False and demo['demo'] is True
        demo_records=check(requests.get(API+'/api/problems',headers=dh,timeout=10));assert len(demo_records)>=9
        assert requests.get(API+'/api/problems/'+str(demo_records[0]['id']),headers=oh,timeout=10).status_code==404
        assert all('JUDGES DEMO' not in str(item) for item in check(requests.get(API+'/api/community-verifications/pending',headers=headers,timeout=10)))
        with sync_playwright() as p:
            browser=p.chromium.launch()
            page=browser.new_page(viewport={'width':1366,'height':768},reduced_motion='reduce')
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(SITE+'/login.html');page.evaluate('(s)=>Auth.save(s)',session);page.goto(SITE+'/citizen/report.html')
            assert page.locator('#pondId').count()==0
            assert page.locator('#sampleAside').is_hidden()
            page.locator('#pondName').fill(pond_name);page.locator('#pondWard').fill(ward)
            page.locator('#category').select_option('PLASTIC_WASTE');page.locator('#description').fill('Temporary automated check of genuine pond reporting without prior registration.')
            with page.expect_response(lambda r:r.url.endswith('/api/problems') and r.request.method=='POST') as response:
                page.locator('#submitBtn').click()
            assert response.value.status==200,response.value.status
            created=response.value.json();problem_id=created['id'];pond_id=created['pondId']
            page.locator('#successPanel').wait_for(state='visible');assert created['latitude'] is None and created['longitude'] is None
            page.goto(SITE+'/citizen/dashboard.html?open='+str(problem_id));page.locator('#complaintDialogBody').get_by_text('Not provided',exact=True).wait_for()
            page.locator('#complaintDialog').get_by_role('button',name='Close',exact=True).click()
            page.goto(SITE+'/citizen/verify.html');assert 'JUDGES DEMO' not in page.locator('.main').inner_text()
            # Real officer sees and manages the named pond with no coordinates and no sample rows.
            page.evaluate('(s)=>Auth.save(s)',officer);page.goto(SITE+'/panchayat/ponds.html')
            page.get_by_text(pond_name,exact=True).wait_for();assert 'JUDGES DEMO' not in page.locator('.main').inner_text()
            page.goto(SITE+'/panchayat/complaints.html?open='+str(problem_id));page.locator('#detailBody').get_by_text('Not provided',exact=True).wait_for()
            page.screenshot(path=str(ROOT/'.runtime/named-pond-officer.png'),full_page=True)
            # Same report form in the demo session gets demo-only suggestions/sample helpers.
            demo_citizen=check(requests.post(API+'/api/auth/login',json={'email':'citizen@judges.invalid','password':'JudgeCitizen123!'},timeout=10))
            page.evaluate('(s)=>Auth.save(s)',demo_citizen);page.goto(SITE+'/citizen/report.html');page.locator('#sampleAside').wait_for(state='visible')
            assert pond_name not in page.locator('#pondSuggestions').inner_html()
            assert not errors,errors
            browser.close()
        print('PASS: real citizen can type an unregistered pond, submit without coordinates, and view it in citizen/officer screens; demo-only helpers and records stay separate',flush=True)
        # Real assignment -> completion -> citizen confirmation still works for the named pond.
        from datetime import datetime,timedelta,timezone
        check(requests.post(API+'/api/tasks',headers=oh,json={'problemId':problem_id,'assignedWorkerId':worker['userId'],'deadline':(datetime.now(timezone.utc)+timedelta(days=2)).isoformat(),'priority':'MEDIUM','instructions':'Temporary automated workflow check'},timeout=10))
        task=check(requests.get(API+'/api/problems/'+str(problem_id),headers=oh,timeout=10))['task']['id']
        check(requests.put(API+'/api/tasks/'+str(task),headers=wh,json={'status':'IN_PROGRESS'},timeout=10))
        with (ROOT/'assets/samples/polluted-1.jpg').open('rb') as before,(ROOT/'assets/samples/clean-1.jpg').open('rb') as after:
            completion=check(requests.post(API+'/api/tasks/'+str(task)+'/complete',headers=wh,data={'remarks':'Temporary automated completion check. Sample images are test fixtures, not field cleanup evidence.'},files={'beforeImage':('before.jpg',before,'image/jpeg'),'afterImage':('after.jpg',after,'image/jpeg')},timeout=20))
        evidence_paths=[completion['evidence']['beforeImageUrl'],completion['evidence']['afterImageUrl']]
        check(requests.post(API+'/api/verifications',headers=oh,json={'taskId':task,'decision':'FORWARD','comment':'Temporary automated review'},timeout=10))
        assert any(x['taskId']==task for x in check(requests.get(API+'/api/community-verifications/pending',headers=headers,timeout=10)))
        check(requests.post(API+'/api/community-verifications',headers=headers,files={'taskId':(None,str(task)),'decision':(None,'CONFIRM'),'comment':(None,'Temporary automated verification')},timeout=10))
        assert check(requests.get(API+'/api/problems/'+str(problem_id),headers=oh,timeout=10))['status']=='VERIFIED'
        assert requests.get(API+'/api/problems/'+str(problem_id),headers=dh,timeout=10).status_code==404
        print('PASS: named-pond real MySQL workflow reached VERIFIED; demo officer cannot access it',flush=True)
    finally:
        # Resolve cleanup IDs from the private fixture owner, including failures after creation.
        env={**os.environ,'MYSQL_PWD':os.environ['DB_PASSWORD']}
        cleanup="""START TRANSACTION;
SET @owner=(SELECT id FROM app_users WHERE email='%s');
SET @pid=(SELECT MAX(id) FROM problems WHERE reporter_id=@owner);
SET @pond=(SELECT pond_id FROM problems WHERE id=@pid);
DELETE FROM user_notifications WHERE problem_id=@pid OR user_id=@owner;
DELETE FROM ai_jobs WHERE problem_id=@pid;
DELETE FROM authority_deliveries WHERE event_id IN (SELECT id FROM deadline_events WHERE problem_id=@pid);
DELETE FROM deadline_events WHERE problem_id=@pid;
DELETE FROM community_verifications WHERE problem_id=@pid;
DELETE FROM task_escalations WHERE task_id IN (SELECT id FROM tasks WHERE problem_id=@pid);
DELETE FROM task_reviews WHERE task_id IN (SELECT id FROM tasks WHERE problem_id=@pid);
DELETE FROM task_evidence WHERE task_id IN (SELECT id FROM tasks WHERE problem_id=@pid);
DELETE FROM task_notes WHERE task_id IN (SELECT id FROM tasks WHERE problem_id=@pid);
DELETE FROM tasks WHERE problem_id=@pid;
DELETE FROM problem_images WHERE problem_id=@pid;
DELETE FROM problem_history WHERE problem_id=@pid;
DELETE FROM problems WHERE id=@pid;
DELETE FROM ponds WHERE id=@pond AND name='%s';
DELETE FROM password_reset_tokens WHERE user_id=@owner;
DELETE FROM app_users WHERE id=@owner;
COMMIT;"""%(email,pond_name)
        # Give the asynchronous AI worker a moment to release any in-flight fixture row.
        result=subprocess.run([os.environ['MYSQL_CLIENT_PATH'],'-h','127.0.0.1','-u','jalachaya','--ssl-mode=REQUIRED','-D','jalachaya'],input=cleanup,text=True,capture_output=True,env=env,creationflags=subprocess.CREATE_NO_WINDOW)
        assert result.returncode==0,'Fixture cleanup failed'
        for url in evidence_paths:
            if not url.startswith('/uploads/problems/'):raise AssertionError('Unexpected evidence path')
            path=(ROOT/'backend'/url.lstrip('/')).resolve()
            assert path.is_relative_to((ROOT/'backend/uploads/problems').resolve())
            path.unlink(missing_ok=True)
        print('PASS: temporary citizen, pond, complaint, evidence and notifications cleaned up',flush=True)

if __name__=='__main__':main()
