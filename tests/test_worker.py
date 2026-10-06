import io,json,sys,time,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from jsonschema import ValidationError
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'assistant'))
import worker
ROOT=Path(__file__).resolve().parents[1]

class WorkerTests(unittest.TestCase):
 def fixture(self):return json.loads((ROOT/'dist/assets/sample-review.json').read_text())['result']
 def test_orientation_metadata_and_bbox_dimensions(self):
  image=Image.new('RGB',(60,30));exif=Image.Exif();exif[274]=6;exif[271]='Test Camera';exif[34853]={1:'N',2:(1,2,3)}
  data=io.BytesIO();image.save(data,format='JPEG',exif=exif)
  encoded,meta=worker.prepare_image(data.getvalue());self.assertEqual(meta['original_size'],[30,60]);self.assertEqual(meta['Make'],'Test Camera');self.assertNotIn('GPSInfo',meta)
  result=self.fixture();result['issues'][0]['bbox']=[.9,.8,.3,.1]
  with self.assertRaises(ValidationError):worker.validate_result(result)
 def test_no_hallucinated_reference_or_comparison(self):
  result=self.fixture();result['reference']={'observations':[],'try_next':'try','differences':'diff'}
  with self.assertRaises(ValidationError):worker.validate_result(result)
  result=self.fixture()
  with self.assertRaises(ValidationError):worker.validate_result(result,has_parent=True)
 def test_model_can_only_run_locally(self):
  with self.assertRaises(ValueError):worker.infer([],{},'https://example.com')
 def test_deletion_during_inference_does_not_resurrect(self):
  class Cloud:
   def __init__(self):self.writes=0
   def image(self,_):return (ROOT/'dist/assets/sample.jpg').read_bytes()
   def rpc(self,name,**params):
    if name=='heartbeat':return False
    if name=='complete_job':self.writes+=1;return False
  job={'id':'job','lease_token':'token','photo':{'path':'image'},'category':'人像','device':'手机','intent':''}
  c=Cloud();original=worker.LeaseKeeper
  def keeper(*args):return original(*args,interval=.01)
  def infer(*args):time.sleep(.05);return self.fixture()
  with patch.object(worker,'LeaseKeeper',side_effect=keeper),patch.object(worker,'infer',side_effect=infer):self.assertFalse(worker.process_job(c,job))
  self.assertEqual(c.writes,0)
 def test_valid_lease_completion_is_not_reported_as_success_on_conflict(self):
  class Cloud:
   def image(self,_):return (ROOT/'dist/assets/sample.jpg').read_bytes()
   def rpc(self,name,**params):return False
  job={'id':'job','lease_token':'token','photo':{'path':'image'},'category':'人像','device':'手机','intent':''}
  with patch.object(worker,'infer',return_value=self.fixture()):self.assertFalse(worker.process_job(Cloud(),job))
 def test_private_key_rejected(self):
  with self.assertRaises(ValueError):worker.Cloud({'url':'https://example.supabase.co','key':'sb_secret_123'},persist=False)

if __name__=='__main__':unittest.main()
