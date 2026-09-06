import traceback
try:
    import face_recognition_models
    print('Success')
except Exception as e:
    print('Error caught:')
    traceback.print_exc()
